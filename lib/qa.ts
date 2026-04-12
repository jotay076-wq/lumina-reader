import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ContentType, SourceAnchor } from './types'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction:
    'You are a Q&A engine. You must only use information explicitly present in the provided content to answer questions. Do not add outside knowledge, inferences, or opinions. If the answer is not present in the content, return null for the answer field and an empty array for anchors. Return valid JSON only — no markdown, no explanation.',
})

// ── Error ────────────────────────────────────────────────────────────────────

export class QaError extends Error {
  constructor(public readonly code: 'GEMINI_ERROR') {
    super(code)
    this.name = 'QaError'
  }
}

// ── Input / Output types ─────────────────────────────────────────────────────

interface SegmentRow {
  text: string
  start_seconds: number
  sequence: number
}

export interface QaInput {
  contentType: ContentType
  extractedText?: string | null
  segments?: SegmentRow[]
  question: string
}

export interface QaResult {
  answer: string | null
  anchors: SourceAnchor[]
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildSegmentPrompt(question: string, segments: SegmentRow[]): string {
  return `Answer the following question using only the transcript below. Include the start_seconds and sequence of every segment that supports your answer.

Question: ${question}

Transcript segments (JSON):
${JSON.stringify(segments, null, 2)}

Return this exact JSON shape:
{
  "answer": "...",
  "anchors": [
    { "type": "timestamp", "start_seconds": 0, "sequence": 0 }
  ]
}

If the answer is not present in the transcript, return:
{ "answer": null, "anchors": [] }`
}

function buildParagraphPrompt(question: string, paragraphs: string[]): string {
  return `Answer the following question using only the content below. Include the paragraph_index of every paragraph that supports your answer.

Question: ${question}

Content (paragraphs as JSON array):
${JSON.stringify(paragraphs, null, 2)}

Return this exact JSON shape:
{
  "answer": "...",
  "anchors": [
    { "type": "paragraph", "paragraph_index": 0 }
  ]
}

If the answer is not present in the content, return:
{ "answer": null, "anchors": [] }`
}

// ── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<QaResult> {
  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim()
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = JSON.parse(json) as { answer: string | null; anchors: SourceAnchor[] }
  return {
    answer: parsed.answer ?? null,
    anchors: Array.isArray(parsed.anchors) ? parsed.anchors : [],
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function askQuestion(input: QaInput): Promise<QaResult> {
  const isSegmentBased =
    input.contentType === 'youtube' || input.contentType === 'audio'

  let prompt: string
  if (isSegmentBased) {
    const segments = input.segments ?? []
    prompt = buildSegmentPrompt(input.question, segments)
  } else {
    const text = input.extractedText ?? ''
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)
    prompt = buildParagraphPrompt(input.question, paragraphs)
  }

  try {
    return await callGemini(prompt)
  } catch {
    try {
      return await callGemini(prompt)
    } catch {
      throw new QaError('GEMINI_ERROR')
    }
  }
}
