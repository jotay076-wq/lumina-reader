export type ContentType = 'youtube' | 'website' | 'pdf' | 'audio' | 'ebook'
export type ContentStatus = 'processing' | 'complete' | 'error'

// ── Summarization types ────────────────────────────────────────────────────

export interface TimestampAnchor {
  type: 'timestamp'
  start_seconds: number
  sequence: number
}

export interface ParagraphAnchor {
  type: 'paragraph'
  paragraph_index: number
}

export type SourceAnchor = TimestampAnchor | ParagraphAnchor

export interface SummaryPoint {
  id: string
  text: string
  anchor: SourceAnchor
}

export interface Highlight {
  id: string
  category: 'key_insight' | 'definition' | 'conclusion'
  text: string
  anchor: SourceAnchor
}

export type SummaryStatus = 'processing' | 'complete' | 'error'

export interface SummaryResponse {
  summaryId: string
  contentId: string
  status: SummaryStatus
  summaryPoints: SummaryPoint[]
  highlights: Highlight[]
  createdAt: string
}

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

// ── Tutor types ────────────────────────────────────────────────────────────

export type TutorStyle = 'analogy' | 'step-by-step' | 'plain-english'

export interface TutorCard {
  cardId: string
  style: TutorStyle
  reexplanation: string
  anchors: SourceAnchor[]
  createdAt: string
}
