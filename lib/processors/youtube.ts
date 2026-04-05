import { YoutubeTranscript } from 'youtube-transcript'
import type { ExtractedContent, TranscriptSegment } from '../types'

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /embed\/([^?&]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export async function processYouTube(url: string): Promise<ExtractedContent> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('UNSUPPORTED_TYPE')

  let rawSegments: Array<{ offset: number; text: string }> = []
  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId)
  } catch {
    throw new Error('TRANSCRIPT_UNAVAILABLE')
  }

  const segments: TranscriptSegment[] = rawSegments.map((s, i) => ({
    start: s.offset / 1000, // offset is in ms
    text: s.text,
    sequence: i,
  }))

  const extractedText = segments.map((s) => s.text).join(' ')
  const title = `YouTube video (${videoId})`

  return {
    contentType: 'youtube',
    title,
    extractedText,
    segments,
    sourceUrl: url,
  }
}
