import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SourceAnchor, TutorStyle } from './types'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction:
    'You are an adaptive tutor. Rewrite the provided passage in the requested explanation style. Preserve all factual information exactly — do not add new facts or change meaning. Return valid JSON only — no markdown, no explanation outside the JSON.',
})

export class TutorError extends Error {
  constructor(public readonly code: 'GEMINI_ERROR') {
    super(code)
    this.name = 'TutorError'
  }
}

const STYLE_INSTRUCTIONS: Record<TutorStyle, string> = {
  'analogy':
    'Rewrite this passage using a concrete real-world analogy that makes the concept immediately intuitive. Keep it brief.',
  'step-by-step':
    'Break this passage into a numbered sequence of simple steps or stages. Each step should be one sentence.',
  'plain-english':
    'Rewrite this passage in the simplest possible language, as if explaining to a curious 12-year-old. Avoid jargon entirely.',
}

export interface TutorResult {
  reexplanation: string
  anchors: SourceAnchor[]
}

function buildPrompt(style: TutorStyle, passageText: string, anchor: SourceAnchor): string {
  const anchorExample =
    anchor.type === 'timestamp'
      ? `{ "type": "timestamp", "start_seconds": ${(anchor as { start_seconds: number }).start_seconds}, "sequence": ${(anchor as { sequence: number }).sequence} }`
      : `{ "type": "paragraph", "paragraph_index": ${(anchor as { paragraph_index: number }).paragraph_index} }`

  return `Style instruction: ${STYLE_INSTRUCTIONS[style]}

Source passage:
${passageText}

Return this exact JSON shape:
{
  "reexplanation": "...",
  "anchors": [${anchorExample}]
}`
}

async function callGemini(prompt: string): Promise<TutorResult> {
  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim()
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = JSON.parse(json) as { reexplanation: string; anchors: SourceAnchor[] }
  return {
    reexplanation: parsed.reexplanation,
    anchors: Array.isArray(parsed.anchors) ? parsed.anchors : [],
  }
}

export async function generateReexplanation(
  style: TutorStyle,
  passageText: string,
  anchor: SourceAnchor
): Promise<TutorResult> {
  const prompt = buildPrompt(style, passageText, anchor)
  try {
    return await callGemini(prompt)
  } catch {
    try {
      return await callGemini(prompt)
    } catch {
      throw new TutorError('GEMINI_ERROR')
    }
  }
}
