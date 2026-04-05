import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('content_items')
    .select('id, content_type, status, title, source_url, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map((item) => ({
      contentId: item.id,
      contentType: item.content_type,
      status: item.status,
      title: item.title,
      sourceUrl: item.source_url,
      createdAt: item.created_at,
    }))
  )
}
