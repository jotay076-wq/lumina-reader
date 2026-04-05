import type { ExtractedContent, TranscriptSegment } from '../types'
import { getSupabaseServiceClient } from '../supabase/service'
import Groq from 'groq-sdk'

function deriveTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function processAudio(
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
    .upload(storagePath, buffer, { contentType: 'audio/*', upsert: true })

  if (uploadError) throw new Error(`STORAGE_ERROR: ${uploadError.message}`)

  // Transcribe with Groq Whisper
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const ext = filename.split('.').pop() ?? 'mp3'
  const transcriptionFilename = `audio.${ext}`

  // Groq SDK expects a File-like object; wrap buffer as Blob
  const blob = new Blob([buffer])
  const file = new File([blob], transcriptionFilename)

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
  })

  // verbose_json returns segments with timestamps
  type VerboseResponse = {
    text: string
    segments?: Array<{ start: number; text: string }>
  }
  const verbose = transcription as unknown as VerboseResponse

  const segments: TranscriptSegment[] = (verbose.segments ?? []).map((s, i) => ({
    start: s.start,
    text: s.text.trim(),
    sequence: i,
  }))

  const extractedText = segments.length > 0
    ? segments.map((s) => s.text).join(' ')
    : verbose.text

  return {
    contentType: 'audio',
    title: deriveTitleFromFilename(filename),
    extractedText,
    segments,
    storagePath,
  }
}
