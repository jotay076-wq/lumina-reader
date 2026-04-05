import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { detectUrlType, detectFileType } from '@/lib/detect-content-type'
import { processYouTube } from '@/lib/processors/youtube'
import { processWebsite } from '@/lib/processors/website'
import { processPdf } from '@/lib/processors/pdf'
import { processAudio } from '@/lib/processors/audio'
import { processEpub } from '@/lib/processors/epub'
import type { ContentType, ExtractedContent } from '@/lib/types'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

function errorResponse(code: string, message: string, status = 422) {
  return NextResponse.json({ error: code, message }, { status })
}

export async function POST(req: NextRequest) {
  // Get the authenticated user from session
  const serverClient = await getSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'No session.' }, { status: 401 })
  }

  const serviceClient = getSupabaseServiceClient()
  const contentType = req.headers.get('content-type') ?? ''

  let url: string | null = null
  let file: File | null = null
  let detectedType: ContentType

  // ── Parse request ─────────────────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    url = typeof body.url === 'string' ? body.url.trim() : null
    if (!url) return errorResponse('INVALID_URL', 'Missing url field.')

    const detection = detectUrlType(url)
    if (!detection.valid) return errorResponse('UNSUPPORTED_TYPE', detection.error)
    detectedType = detection.type
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData().catch(() => null)
    file = formData?.get('file') as File | null
    if (!file) return errorResponse('INVALID_REQUEST', 'No file in form data.')

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('FILE_TOO_LARGE', `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB limit.`)
    }

    const detection = detectFileType(file)
    if (!detection.valid) return errorResponse('UNSUPPORTED_TYPE', detection.error)
    detectedType = detection.type
  } else {
    return errorResponse('INVALID_REQUEST', 'Content-Type must be application/json or multipart/form-data.')
  }

  // ── Create content_items record (status=processing) ────────────────────────
  const { data: item, error: insertError } = await serviceClient
    .from('content_items')
    .insert({
      user_id: user.id,
      content_type: detectedType,
      status: 'processing',
      title: url ? new URL(url).hostname : (file?.name ?? 'Untitled'),
      source_url: url,
    })
    .select('id')
    .single()

  if (insertError || !item) {
    return NextResponse.json({ error: 'DB_ERROR', message: 'Failed to create content record.' }, { status: 500 })
  }

  const contentId: string = item.id

  // ── Process content ────────────────────────────────────────────────────────
  let extracted: ExtractedContent
  let errorCode: string | null = null

  try {
    switch (detectedType) {
      case 'youtube':
        extracted = await processYouTube(url!)
        break
      case 'website':
        extracted = await processWebsite(url!)
        break
      case 'pdf': {
        const buf = Buffer.from(await file!.arrayBuffer())
        extracted = await processPdf(buf, file!.name)
        break
      }
      case 'audio': {
        const buf = Buffer.from(await file!.arrayBuffer())
        extracted = await processAudio(buf, file!.name, user.id, contentId)
        break
      }
      case 'ebook': {
        const buf = Buffer.from(await file!.arrayBuffer())
        extracted = await processEpub(buf, file!.name, user.id, contentId)
        break
      }
    }
  } catch (err: unknown) {
    errorCode = err instanceof Error ? err.message : 'PROCESSING_ERROR'
    await serviceClient
      .from('content_items')
      .update({ status: 'error', error_code: errorCode })
      .eq('id', contentId)

    return NextResponse.json(
      { contentId, contentType: detectedType, status: 'error', title: url ?? file?.name ?? 'Unknown', error: errorCode },
      { status: 201 }
    )
  }

  // ── Persist extracted data ─────────────────────────────────────────────────
  await serviceClient
    .from('content_items')
    .update({
      status: 'complete',
      title: extracted.title,
      extracted_text: extracted.extractedText,
      storage_path: extracted.storagePath ?? null,
    })
    .eq('id', contentId)

  // Transcript segments (YouTube + audio)
  if (extracted.segments && extracted.segments.length > 0) {
    await serviceClient.from('transcript_segments').insert(
      extracted.segments.map((s) => ({
        content_id: contentId,
        start_seconds: s.start,
        text: s.text,
        sequence: s.sequence,
      }))
    )
  }

  // eBook chapters
  if (extracted.chapters && extracted.chapters.length > 0) {
    await serviceClient.from('ebook_chapters').insert(
      extracted.chapters.map((c) => ({
        content_id: contentId,
        chapter_index: c.chapterIndex,
        title: c.title,
        text: c.text,
      }))
    )
  }

  return NextResponse.json(
    { contentId, contentType: detectedType, status: 'complete', title: extracted.title },
    { status: 201 }
  )
}
