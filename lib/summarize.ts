import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ContentType, SourceAnchor } from './types'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction:
    'You are a summarization engine. You must only use information explicitly present in the provided content. Do not add outside knowledge, inferences, or opinions. Return valid JSON only — no markdown, no explanation.',
})

// ── Internal Gemini response shapes ────────────────────────────────────────

interface GeminiSummaryPoint {
  text: string
  anchor: SourceAnchor
}

interface GeminiHighlight {
  category: 'key_insight' | 'definition' | 'conclusion'
  text: string
  anchor: SourceAnchor
}

interface GeminiResponse {
  summary_points: GeminiSummaryPoint[]
  highlights: GeminiHighlight[]
}

// ── Public return type (IDs omitted — assigned at DB insert time) ──────────

export interface RawSummaryPoint {
  text: string
  anchor: SourceAnchor
}

export interface RawHighlight {
  category: 'key_insight' | 'definition' | 'conclusion'
  text: string
  anchor: SourceAnchor
}

export interface SummarizeResult {
  summaryPoints: RawSummaryPoint[]
  highlights: RawHighlight[]
}

// ── Input types ─────────────────────────────────────────────────────────────

interface SegmentRow {
  text: string
  start_seconds: number
  sequence: number
}

interface SummarizeInput {
  contentType: ContentType
  extractedText?: string | null
  segments?: SegmentRow[]
}

// ── Error codes ──────────────────────────────────────────────────────────────

export class SummarizeError extends Error {
  constructor(public readonly code: 'CONTENT_TOO_SHORT' | 'GEMINI_ERROR') {
    super(code)
    this.name = 'SummarizeError'
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function buildSegmentPrompt(segments: SegmentRow[]): string {
  return `Summarize the following transcript. For each summary point, include the \`start_seconds\` of the segment it comes from. Also identify up to 15 highlights (key_insight, definition, or conclusion) with the exact segment sequence number.

Transcript segments (JSON):
${JSON.stringify(segments, null, 2)}

Return this exact JSON shape:
{
  "summary_points": [
    { "text": "...", "anchor": { "type": "timestamp", "start_seconds": 0, "sequence": 0 } }
  ],
  "highlights": [
    { "category": "key_insight | definition | conclusion", "text": "exact text from transcript", "anchor": { "type": "timestamp", "start_seconds": 0, "sequence": 0 } }
  ]
}`
}

function buildParagraphPrompt(paragraphs: string[]): string {
  return `Summarize the following content. For each summary point, include the paragraph index (0-based) it comes from. Also identify up to 15 highlights (key_insight, definition, or conclusion) with the exact quoted text and paragraph index.

Content (paragraphs as JSON array):
${JSON.stringify(paragraphs, null, 2)}

Return this exact JSON shape:
{
  "summary_points": [
    { "text": "...", "anchor": { "type": "paragraph", "paragraph_index": 0 } }
  ],
  "highlights": [
    { "category": "key_insight | definition | conclusion", "text": "exact quoted text", "anchor": { "type": "paragraph", "paragraph_index": 0 } }
  ]
}`
}

async function callGemini(prompt: string): Promise<GeminiResponse> {
  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim()
  // Strip possible markdown fences
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json) as GeminiResponse
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function summarizeContent(input: SummarizeInput): Promise<SummarizeResult> {
  const isSegmentBased =
    input.contentType === 'youtube' || input.contentType === 'audio'

  // Content-length gate
  if (isSegmentBased) {
    const segments = input.segments ?? []
    if (segments.length === 0) throw new SummarizeError('CONTENT_TOO_SHORT')
    const lastSeg = segments[segments.length - 1]
    if (lastSeg.start_seconds < 30) throw new SummarizeError('CONTENT_TOO_SHORT')
  } else {
    const text = input.extractedText ?? ''
    if (countWords(text) < 100) throw new SummarizeError('CONTENT_TOO_SHORT')
  }

  // Build prompt
  let prompt: string
  let sourceText: string

  if (isSegmentBased) {
    const segments = input.segments!
    prompt = buildSegmentPrompt(segments)
    sourceText = segments.map((s) => s.text).join(' ')
  } else {
    const text = input.extractedText!
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)
    prompt = buildParagraphPrompt(paragraphs)
    sourceText = text
  }

  // Call Gemini with one retry on JSON parse failure
  let parsed: GeminiResponse
  try {
    parsed = await callGemini(prompt)
  } catch {
    try {
      parsed = await callGemini(prompt)
    } catch {
      throw new SummarizeError('GEMINI_ERROR')
    }
  }

  // Filter highlights whose text is not a substring of the source content
  const validHighlights = (parsed.highlights ?? []).filter((h) =>
    sourceText.includes(h.text)
  )

  return {
    summaryPoints: (parsed.summary_points ?? []).map((sp) => ({
      text: sp.text,
      anchor: sp.anchor,
    })),
    highlights: validHighlights.map((h) => ({
      category: h.category,
      text: h.text,
      anchor: h.anchor,
    })),
  }
}
