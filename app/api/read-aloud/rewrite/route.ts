import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const VALID_TONES = ['neutral', 'storytelling', 'analytical', 'motivational', 'casual', 'academic'] as const
type ToneMode = typeof VALID_TONES[number]

const TONE_INSTRUCTIONS: Record<ToneMode, string> = {
  neutral: 'Preserve the original meaning and structure. Use clear, plain language.',
  storytelling: 'Rewrite as a flowing narrative with vivid transitions and a conversational arc.',
  analytical: 'Use precise, structured language. Emphasize cause-effect relationships and logical flow.',
  motivational: 'Use energetic, encouraging language. Emphasize impact and possibility.',
  casual: 'Use relaxed, friendly language as if explaining to a friend. Contractions welcome.',
  academic: 'Use formal academic register. Prefer passive constructions and discipline-appropriate vocabulary.',
}

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction:
    'You are a text rewriting engine. Rewrite the provided content in the specified tone. Preserve all factual information exactly. Do not add new facts, remove key points, or change meaning. Return only the rewritten plain text — no markdown, no explanation, no JSON wrapper.',
})

export async function POST(req: NextRequest) {
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const contentId: string | undefined = typeof body.contentId === 'string' ? body.contentId : undefined
  const tone = body.tone

  if (!contentId) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Missing contentId.' }, { status: 400 })
  }

  if (!VALID_TONES.includes(tone)) {
    return NextResponse.json(
      { error: 'INVALID_TONE', message: `tone must be one of: ${VALID_TONES.join(', ')}` },
      { status: 400 }
    )
  }

  const service = getSupabaseServiceClient()

  // Look up content item
  const { data: item } = await service
    .from('content_items')
    .select('id, status, content_type, extracted_text')
    .eq('id', contentId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'CONTENT_NOT_FOUND', message: 'No content item found for the given contentId.' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentItem = item as any
  if (contentItem.status !== 'complete') {
    return NextResponse.json(
      { error: 'CONTENT_NOT_READY', message: 'Content item is still processing or errored.' },
      { status: 422 }
    )
  }

  // Build source text
  let sourceText: string
  if (contentItem.content_type === 'youtube' || contentItem.content_type === 'audio') {
    const { data: segs } = await service
      .from('transcript_segments')
      .select('text, sequence')
      .eq('content_id', contentId)
      .order('sequence', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sourceText = ((segs as any[]) ?? []).map((s: { text: string }) => s.text).join(' ')
  } else {
    sourceText = contentItem.extracted_text ?? ''
  }

  if (!sourceText.trim()) {
    return NextResponse.json({ error: 'GEMINI_ERROR', message: 'Tone rewrite failed. Please try again.' }, { status: 500 })
  }

  // Call Gemini
  let rewrittenText: string
  try {
    const toneInstruction = TONE_INSTRUCTIONS[tone as ToneMode]
    const result = await model.generateContent(`Tone: ${toneInstruction}\n\nContent:\n${sourceText}`)
    rewrittenText = result.response.text().trim()
    if (!rewrittenText) throw new Error('empty response')
  } catch {
    return NextResponse.json({ error: 'GEMINI_ERROR', message: 'Tone rewrite failed. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ contentId, tone, rewrittenText })
}
