import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params

  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const supabase = getSupabaseServiceClient()

  const { data: item, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', contentId)
    .eq('user_id', user.id)
    .single()

  if (error || !item) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Fetch segments if youtube or audio
  let segments = null
  if (item.content_type === 'youtube' || item.content_type === 'audio') {
    const { data } = await supabase
      .from('transcript_segments')
      .select('start_seconds, text, sequence')
      .eq('content_id', contentId)
      .order('sequence')
    segments = data?.map((s) => ({ start: s.start_seconds, text: s.text, sequence: s.sequence })) ?? []
  }

  // Fetch chapters if ebook
  let chapters = null
  if (item.content_type === 'ebook') {
    const { data } = await supabase
      .from('ebook_chapters')
      .select('chapter_index, title, text')
      .eq('content_id', contentId)
      .order('chapter_index')
    chapters = data ?? []
  }

  return NextResponse.json({
    contentId: item.id,
    contentType: item.content_type,
    status: item.status,
    title: item.title,
    sourceUrl: item.source_url,
    extractedText: item.extracted_text,
    segments,
    chapters,
    errorCode: item.error_code,
    createdAt: item.created_at,
  })
}
