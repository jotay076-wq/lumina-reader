import type { ContentType } from './types'

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch/,
  /^https?:\/\/youtu\.be\//,
]

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg']
const AUDIO_MIMES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a']

export type DetectionResult =
  | { type: ContentType; valid: true }
  | { type: null; valid: false; error: string }

export function detectUrlType(url: string): DetectionResult {
  for (const pattern of YOUTUBE_PATTERNS) {
    if (pattern.test(url)) return { type: 'youtube', valid: true }
  }
  if (/^https?:\/\//i.test(url)) return { type: 'website', valid: true }
  return {
    type: null,
    valid: false,
    error: 'Invalid URL. Accepted: YouTube links or any https:// website URL.',
  }
}

export function detectFileType(file: File): DetectionResult {
  const name = file.name.toLowerCase()
  const mime = file.type

  if (name.endsWith('.pdf') || mime === 'application/pdf') return { type: 'pdf', valid: true }
  if (AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext)) || AUDIO_MIMES.includes(mime))
    return { type: 'audio', valid: true }
  if (name.endsWith('.epub') || mime === 'application/epub+zip') return { type: 'ebook', valid: true }

  return {
    type: null,
    valid: false,
    error: 'Unsupported file type. Accepted: PDF, audio (.mp3/.wav/.m4a/.ogg), or eBook (.epub).',
  }
}

export function getAcceptedFormats(): string {
  return 'YouTube URLs, website URLs, PDF, audio (.mp3/.wav/.m4a/.ogg), or eBook (.epub)'
}
