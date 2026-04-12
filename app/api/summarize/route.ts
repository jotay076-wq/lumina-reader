import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { summarizeContent, SummarizeError } from '@/lib/summarize'

export async function POST(req: NextRequest) {
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const contentId: string | undefined = typeof body.contentId === 'string' ? body.contentId : undefined
  if (!contentId) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Missing contentId.' }, { status: 400 })
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

  // Check for existing summary
  const { data: existing } = await service
    .from('summaries')
    .select('id')
    .eq('content_id', contentId)
    .single()

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingSummary = existing as any
    return NextResponse.json(
      { error: 'SUMMARY_EXISTS', message: 'A summary already exists for this content item.', summaryId: existingSummary.id },
      { status: 409 }
    )
  }

  // Insert summaries row as processing
  const { data: summaryRow } = await service
    .from('summaries')
    .insert({ content_id: contentId, status: 'processing' })
    .select('id')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryId = (summaryRow as any)?.id as string

  // Respond immediately with 202
  const response = NextResponse.json({ summaryId, status: 'processing' }, { status: 202 })

  // Fire-and-forget async summarization
  void (async () => {
    try {
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

      const result = await summarizeContent({
        contentType: contentItem.content_type,
        extractedText: contentItem.extracted_text,
        segments,
      })

      // Insert summary_points
      if (result.summaryPoints.length > 0) {
        await service.from('summary_points').insert(
          result.summaryPoints.map((sp, idx) => {
            const anchor = sp.anchor
            if (anchor.type === 'timestamp') {
              return {
                summary_id: summaryId,
                text: sp.text,
                anchor_type: 'timestamp',
                anchor_start_seconds: anchor.start_seconds,
                anchor_sequence: anchor.sequence,
                anchor_paragraph_index: null,
                position: idx,
              }
            } else {
              return {
                summary_id: summaryId,
                text: sp.text,
                anchor_type: 'paragraph',
                anchor_start_seconds: null,
                anchor_sequence: null,
                anchor_paragraph_index: anchor.paragraph_index,
                position: idx,
              }
            }
          })
        )
      }

      // Insert highlights
      if (result.highlights.length > 0) {
        await service.from('highlights').insert(
          result.highlights.map((h) => {
            const anchor = h.anchor
            if (anchor.type === 'timestamp') {
              return {
                summary_id: summaryId,
                category: h.category,
                text: h.text,
                anchor_type: 'timestamp',
                anchor_start_seconds: anchor.start_seconds,
                anchor_sequence: anchor.sequence,
                anchor_paragraph_index: null,
              }
            } else {
              return {
                summary_id: summaryId,
                category: h.category,
                text: h.text,
                anchor_type: 'paragraph',
                anchor_start_seconds: null,
                anchor_sequence: null,
                anchor_paragraph_index: anchor.paragraph_index,
              }
            }
          })
        )
      }

      await service
        .from('summaries')
        .update({ status: 'complete' })
        .eq('id', summaryId)
    } catch (err) {
      const errorCode =
        err instanceof SummarizeError ? err.code : 'GEMINI_ERROR'
      await service
        .from('summaries')
        .update({ status: 'error', error_code: errorCode })
        .eq('id', summaryId)
    }
  })()

  return response
}
