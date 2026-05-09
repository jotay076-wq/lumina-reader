import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SourceAnchor, TutorCard } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params

  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const service = getSupabaseServiceClient()

  // Verify content exists and belongs to user
  const { data: item } = await service
    .from('content_items')
    .select('id')
    .eq('id', contentId)
    .eq('user_id', user.id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'CONTENT_NOT_FOUND', message: 'No content item found.' }, { status: 404 })
  }

  const { data: rows } = await service
    .from('tutor_cards')
    .select('id, style, anchor_type, anchor_ref, reexplanation, created_at')
    .eq('content_id', contentId)
    .order('created_at', { ascending: false })

  const cards: TutorCard[] = (rows ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const anchor: SourceAnchor = r.anchor_type === 'timestamp'
      ? { type: 'timestamp', start_seconds: 0, sequence: r.anchor_ref }
      : { type: 'paragraph', paragraph_index: r.anchor_ref }
    return {
      cardId: r.id,
      style: r.style,
      reexplanation: r.reexplanation,
      anchors: [anchor],
      createdAt: r.created_at,
    }
  })

  return NextResponse.json({ contentId, cards })
}
