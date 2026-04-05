export type ContentType = 'youtube' | 'website' | 'pdf' | 'audio' | 'ebook'
export type ContentStatus = 'processing' | 'complete' | 'error'

export interface TranscriptSegment {
  start: number // seconds
  text: string
  sequence: number
}

export interface EbookChapter {
  chapterIndex: number
  title: string
  text: string
}

export interface ExtractedContent {
  contentType: ContentType
  title: string
  extractedText: string
  segments?: TranscriptSegment[] // youtube and audio only
  chapters?: EbookChapter[] // ebook only
  pageCount?: number // pdf only
  sourceUrl?: string // youtube and website only
  storagePath?: string // pdf, audio, ebook only
}

export interface ContentItem {
  id: string
  user_id: string
  content_type: ContentType
  status: ContentStatus
  title: string
  source_url: string | null
  storage_path: string | null
  extracted_text: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

export interface ContentListItem {
  contentId: string
  contentType: ContentType
  status: ContentStatus
  title: string
  sourceUrl: string | null
  createdAt: string
}
