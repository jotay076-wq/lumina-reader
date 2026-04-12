import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { askQuestion, QaError } from '@/lib/qa'

export async function POST(req: NextRequest) {
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const contentId: string | undefined = typeof body.contentId === 'string' ? body.contentId : undefined
  const question: string | undefined = typeof body.question === 'string' ? body.question : undefined

  if (!contentId) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Missing contentId.' }, { status: 400 })
  }

  const trimmedQuestion = question?.trim() ?? ''
  if (!trimmedQuestion || trimmedQuestion.length > 500) {
    return NextResponse.json(
      { error: 'INVALID_QUESTION', message: 'Question must be between 1 and 500 characters.' },
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

  // Fetch transcript segments for youtube/audio
  let segments: { text: string; start_seconds: number; sequence: number }[] | undefined
  if (contentItem.content_type === 'youtube' || contentItem.content_type === 'audio') {
    const { data: segs } = await service
      .from('transcript_segments')
      .select('text, start_seconds, sequence')
      .eq('content_id', contentId)
      .order('sequence', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    segments = (segs as any[]) ?? []
  }

  // Call Gemini Q&A service
  let result: { answer: string | null; anchors: Array<{ type: string; start_seconds?: number; sequence?: number; paragraph_index?: number }> }
  try {
    result = await askQuestion({
      contentType: contentItem.content_type,
      extractedText: contentItem.extracted_text,
      segments,
      question: trimmedQuestion,
    })
  } catch (err) {
    if (err instanceof QaError) {
      return NextResponse.json(
        { error: 'GEMINI_ERROR', message: "Couldn't get an answer. Tap Retry." },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Unexpected error.' }, { status: 500 })
  }

  // Insert qa_messages row
  const { data: msgRow } = await service
    .from('qa_messages')
    .insert({ content_id: contentId, question: trimmedQuestion, answer: result.answer })
    .select('id, created_at')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = msgRow as any
  const messageId: string = msg?.id

  // Insert qa_anchors rows only if there are anchors
  if (result.anchors.length > 0) {
    await service.from('qa_anchors').insert(
      result.anchors.map((anchor, idx) => {
        if (anchor.type === 'timestamp') {
          return {
            message_id: messageId,
            anchor_type: 'timestamp',
            anchor_start_seconds: anchor.start_seconds ?? null,
            anchor_sequence: anchor.sequence ?? null,
            anchor_paragraph_index: null,
            position: idx,
          }
        } else {
          return {
            message_id: messageId,
            anchor_type: 'paragraph',
            anchor_start_seconds: null,
            anchor_sequence: null,
            anchor_paragraph_index: anchor.paragraph_index ?? null,
            position: idx,
          }
        }
      })
    )
  }

  // Reconstruct anchors for response
  const responseAnchors = result.anchors.map((anchor) => {
    if (anchor.type === 'timestamp') {
      return { type: 'timestamp' as const, start_seconds: anchor.start_seconds!, sequence: anchor.sequence! }
    }
    return { type: 'paragraph' as const, paragraph_index: anchor.paragraph_index! }
  })

  return NextResponse.json({
    messageId,
    question: trimmedQuestion,
    answer: result.answer,
    anchors: responseAnchors,
    createdAt: msg?.created_at,
  })
}
