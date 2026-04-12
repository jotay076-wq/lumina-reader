import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { SourceAnchor } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params
  const service = getSupabaseServiceClient()

  // Verify content exists
  const { data: item } = await service
    .from('content_items')
    .select('id')
    .eq('id', contentId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'CONTENT_NOT_FOUND' }, { status: 404 })
  }

  // Fetch all qa_messages ordered by created_at
  const { data: msgRows } = await service
    .from('qa_messages')
    .select('id, question, answer, created_at')
    .eq('content_id', contentId)
    .order('created_at', { ascending: true })

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

  const messages = await Promise.all(
    ((msgRows as unknown[]) ?? []).map(async (r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = r as any
      const { data: anchorRows } = await service
        .from('qa_anchors')
        .select('anchor_type, anchor_start_seconds, anchor_sequence, anchor_paragraph_index, position')
        .eq('message_id', msg.id)
        .order('position', { ascending: true })

      const anchors: SourceAnchor[] = ((anchorRows as unknown[]) ?? []).map((a) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return buildAnchor(a as any)
      })

      return {
        messageId: msg.id,
        question: msg.question,
        answer: msg.answer,
        anchors,
        createdAt: msg.created_at,
      }
    })
  )

  return NextResponse.json({ contentId, messages })
}
