import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { SummaryPoint, Highlight, SourceAnchor } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params
  const service = getSupabaseServiceClient()

  // Look up summary row
  const { data: summaryRow } = await service
    .from('summaries')
    .select('id, status, created_at')
    .eq('content_id', contentId)
    .single()

  if (!summaryRow) {
    return NextResponse.json({ error: 'SUMMARY_NOT_FOUND' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = summaryRow as any

  // Fetch summary points ordered by position
  const { data: pointRows } = await service
    .from('summary_points')
    .select('id, text, anchor_type, anchor_start_seconds, anchor_sequence, anchor_paragraph_index, position')
    .eq('summary_id', summary.id)
    .order('position', { ascending: true })

  // Fetch highlights
  const { data: highlightRows } = await service
    .from('highlights')
    .select('id, category, text, anchor_type, anchor_start_seconds, anchor_sequence, anchor_paragraph_index')
    .eq('summary_id', summary.id)

  function buildAnchor(row: {
    anchor_type: string
    anchor_start_seconds: number | null
    anchor_sequence: number | null
    anchor_paragraph_index: number | null
  }): SourceAnchor {
    if (row.anchor_type === 'timestamp') {
      return {
        type: 'timestamp',
        start_seconds: row.anchor_start_seconds!,
        sequence: row.anchor_sequence!,
      }
    }
    return {
      type: 'paragraph',
      paragraph_index: row.anchor_paragraph_index!,
    }
  }

  const summaryPoints: SummaryPoint[] = ((pointRows as unknown[]) ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any
    return {
      id: row.id,
      text: row.text,
      anchor: buildAnchor(row),
    }
  })

  const highlights: Highlight[] = ((highlightRows as unknown[]) ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any
    return {
      id: row.id,
      category: row.category,
      text: row.text,
      anchor: buildAnchor(row),
    }
  })

  return NextResponse.json({
    summaryId: summary.id,
    contentId,
    status: summary.status,
    summaryPoints,
    highlights,
    createdAt: summary.created_at,
  })
}
