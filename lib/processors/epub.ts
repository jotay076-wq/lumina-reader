import type { ExtractedContent, EbookChapter } from '../types'
import { getSupabaseServiceClient } from '../supabase/service'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

function deriveTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function processEpub(
  buffer: Buffer,
  filename: string,
  userId: string,
  contentId: string
): Promise<ExtractedContent> {
  const supabase = getSupabaseServiceClient()

  // Upload to Supabase Storage
  const storagePath = `uploads/${userId}/${contentId}/original`
  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, buffer, { contentType: 'application/epub+zip', upsert: true })

  if (uploadError) throw new Error(`STORAGE_ERROR: ${uploadError.message}`)

  // Write buffer to temp file for epub2 parser
  const tmpFile = path.join(os.tmpdir(), `lumina-${contentId}.epub`)
  await fs.writeFile(tmpFile, buffer)

  const chapters: EbookChapter[] = []

  try {
    const EPub = (await import('epub2')).default
    const book = await EPub.createAsync(tmpFile)

    const toc = book.toc as Array<{ id: string; title: string; order: number }>
    const sortedChapters = [...toc].sort((a, b) => a.order - b.order)

    for (let i = 0; i < sortedChapters.length; i++) {
      const chapter = sortedChapters[i]
      try {
        const [chapterHtml] = await book.getChapterAsync(chapter.id)
        const text = stripHtml(chapterHtml)
        if (text.length > 20) {
          chapters.push({
            chapterIndex: i,
            title: chapter.title || `Chapter ${i + 1}`,
            text,
          })
        }
      } catch {
        // Skip chapters that fail to parse
      }
    }
  } finally {
    await fs.unlink(tmpFile).catch(() => {})
  }

  const extractedText = chapters.map((c) => c.text).join('\n\n')
  const title = deriveTitleFromFilename(filename)

  return {
    contentType: 'ebook',
    title,
    extractedText,
    chapters,
    storagePath,
  }
}
