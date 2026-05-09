import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateReexplanation, TutorError } from '@/lib/tutor'
import type { TutorStyle, SourceAnchor } from '@/lib/types'

const VALID_STYLES: TutorStyle[] = ['analogy', 'step-by-step', 'plain-english']

export async function POST(req: NextRequest) {
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { contentId, anchorType, anchorRef, style } = body

  if (
    typeof contentId !== 'string' ||
    (anchorType !== 'timestamp' && anchorType !== 'paragraph') ||
    typeof anchorRef !== 'number' ||
    !VALID_STYLES.includes(style)
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Invalid request body.' }, { status: 400 })
  }

  const service = getSupabaseServiceClient()

  // Verify content exists and is complete
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
    return NextResponse.json({ error: 'CONTENT_NOT_READY', message: 'Content item is still processing or errored.' }, { status: 422 })
  }

  // Check for existing card (dedup)
  const { data: existing } = await service
    .from('tutor_cards')
    .select('*')
    .eq('content_id', contentId)
    .eq('anchor_type', anchorType)
    .eq('anchor_ref', anchorRef)
    .eq('style', style)
    .single()

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = existing as any
    const anchor: SourceAnchor = e.anchor_type === 'timestamp'
      ? { type: 'timestamp', start_seconds: 0, sequence: e.anchor_ref }
      : { type: 'paragraph', paragraph_index: e.anchor_ref }
    return NextResponse.json({
      cardId: e.id,
      contentId,
      style: e.style,
      reexplanation: e.reexplanation,
      anchors: [anchor],
      createdAt: e.created_at,
    })
  }

  // Resolve passage text
  let passageText: string
  let anchor: SourceAnchor

  if (anchorType === 'timestamp') {
    const { data: seg } = await service
      .from('transcript_segments')
      .select('text, start_seconds, sequence')
      .eq('content_id', contentId)
      .eq('sequence', anchorRef)
      .single()

    if (!seg) {
      return NextResponse.json({ error: 'INVALID_ANCHOR', message: 'anchorRef does not match a known segment in this content item.' }, { status: 400 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = seg as any
    passageText = s.text
    anchor = { type: 'timestamp', start_seconds: s.start_seconds, sequence: s.sequence }
  } else {
    const extractedText: string = contentItem.extracted_text ?? ''
    const paragraphs = extractedText.split(/\n\n+/).filter((p: string) => p.trim().length > 0)
    if (anchorRef < 0 || anchorRef >= paragraphs.length) {
      return NextResponse.json({ error: 'INVALID_ANCHOR', message: 'anchorRef does not match a known paragraph in this content item.' }, { status: 400 })
    }
    passageText = paragraphs[anchorRef]
    anchor = { type: 'paragraph', paragraph_index: anchorRef }
  }

  // Call Gemini
  let result: { reexplanation: string; anchors: SourceAnchor[] }
  try {
    result = await generateReexplanation(style, passageText, anchor)
  } catch (err) {
    const code = err instanceof TutorError ? err.code : 'GEMINI_ERROR'
    return NextResponse.json({ error: code, message: 'Re-explanation failed. Please try again.' }, { status: 500 })
  }

  // Persist card
  const { data: card } = await service
    .from('tutor_cards')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      content_id: contentId,
      style,
      anchor_type: anchorType,
      anchor_ref: anchorRef,
      reexplanation: result.reexplanation,
    } as any)
    .select('id, created_at')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = card as any

  return NextResponse.json({
    cardId: c.id,
    contentId,
    style,
    reexplanation: result.reexplanation,
    anchors: result.anchors,
    createdAt: c.created_at,
  })
}
