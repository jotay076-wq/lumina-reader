'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { SourceAnchor, TranscriptSegment } from './types'

export type ToneMode = 'neutral' | 'storytelling' | 'analytical' | 'motivational' | 'casual' | 'academic'
export type PlaybackStatus = 'idle' | 'rewriting' | 'playing' | 'paused' | 'error'

export const TONE_LABELS: Record<ToneMode, string> = {
  neutral: 'Neutral',
  storytelling: 'Story',
  analytical: 'Analytical',
  motivational: 'Motivational',
  casual: 'Casual',
  academic: 'Academic',
}

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const

interface ReadAloudState {
  status: PlaybackStatus
  tone: ToneMode
  rate: number
  wordSpans: string[]
  currentWordIndex: number
  speechSupported: boolean
  cache: Partial<Record<ToneMode, string>>
}

export interface ReadAloudControls extends ReadAloudState {
  play: (fromWordIndex?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setTone: (tone: ToneMode) => void
  setRate: (rate: number) => void
  playFromAnchor: (
    anchor: SourceAnchor,
    segments?: TranscriptSegment[],
    extractedText?: string | null
  ) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

function chunkIntoSentences(words: string[], maxPerChunk = 50): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  for (const word of words) {
    current.push(word)
    if (current.length >= maxPerChunk || /[.!?]$/.test(word)) {
      chunks.push(current)
      current = []
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** Map a source anchor to a word index in the rewritten wordSpans */
function anchorToWordIndex(
  anchor: SourceAnchor,
  wordSpans: string[],
  segments?: TranscriptSegment[],
  extractedText?: string | null
): number {
  if (wordSpans.length === 0) return 0
  const rewrittenText = wordSpans.join(' ')

  if (anchor.type === 'timestamp' && segments) {
    // Build joined source text up to the target sequence
    const upToSeq = segments
      .filter((s) => s.sequence <= anchor.sequence)
      .map((s) => s.text)
      .join(' ')
    // Find approximate character fraction
    const sourceText = segments.map((s) => s.text).join(' ')
    const fraction = sourceText.length > 0 ? upToSeq.length / sourceText.length : 0
    return Math.min(Math.floor(fraction * wordSpans.length), wordSpans.length - 1)
  }

  if (anchor.type === 'paragraph' && extractedText) {
    const paragraphs = extractedText.split(/\n\n+/).filter((p) => p.trim().length > 0)
    const upTo = paragraphs.slice(0, anchor.paragraph_index).join('\n\n')
    const fraction = extractedText.length > 0 ? upTo.length / extractedText.length : 0
    // Apply fraction to rewritten text length
    const charOffset = Math.floor(fraction * rewrittenText.length)
    // Count words up to that char offset
    let count = 0
    let chars = 0
    for (const w of wordSpans) {
      if (chars >= charOffset) break
      chars += w.length + 1
      count++
    }
    return Math.min(count, wordSpans.length - 1)
  }

  return 0
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useReadAloud({
  contentId,
  contentStatus,
}: {
  contentId: string
  contentStatus: string
}): ReadAloudControls {
  const [state, setState] = useState<ReadAloudState>({
    status: 'idle',
    tone: 'neutral',
    rate: 1,
    wordSpans: [],
    currentWordIndex: 0,
    speechSupported: false,
    cache: {},
  })

  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([])
  const chunkIndexRef = useRef(0)
  const wordOffsetRef = useRef(0) // word index at start of current chunk
  const stateRef = useRef(state)
  stateRef.current = state

  // Detect speech support on client
  useEffect(() => {
    setState((s) => ({
      ...s,
      speechSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    }))
  }, [])

  // ── Playback engine ─────────────────────────────────────────────────────

  const speakFromIndex = useCallback((wordSpans: string[], fromIndex: number, rate: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const chunks = chunkIntoSentences(wordSpans)
    utterancesRef.current = []
    chunkIndexRef.current = 0

    // Find which chunk contains fromIndex
    let wordCount = 0
    let startChunkIdx = 0
    let startWordInChunk = fromIndex
    for (let i = 0; i < chunks.length; i++) {
      if (wordCount + chunks[i].length > fromIndex) {
        startChunkIdx = i
        startWordInChunk = fromIndex - wordCount
        break
      }
      wordCount += chunks[i].length
    }
    chunkIndexRef.current = startChunkIdx
    wordOffsetRef.current = wordCount

    // Build utterances from startChunkIdx onward
    for (let i = startChunkIdx; i < chunks.length; i++) {
      const chunk = chunks[i]
      const chunkText = (i === startChunkIdx ? chunk.slice(startWordInChunk) : chunk).join(' ')
      const utt = new SpeechSynthesisUtterance(chunkText)
      utt.rate = rate

      const chunkWordOffset = (i === startChunkIdx)
        ? fromIndex
        : (chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0))

      utt.onboundary = (e: SpeechSynthesisEvent) => {
        if (e.name !== 'word') return
        // Count words up to charIndex in this utterance text
        const textUpTo = chunkText.slice(0, e.charIndex)
        const wordsSpoken = textUpTo.split(/\s+/).filter(Boolean).length
        const globalIdx = chunkWordOffset + wordsSpoken
        setState((s) => ({ ...s, currentWordIndex: globalIdx }))
        // Auto-scroll
        const el = document.querySelector(`[data-word-index="${globalIdx}"]`) as HTMLElement | null
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      utt.onend = () => {
        const isLast = i === chunks.length - 1
        if (isLast) {
          setState((s) => ({ ...s, status: 'idle', currentWordIndex: 0 }))
        }
      }

      utt.onerror = () => {
        setState((s) => ({ ...s, status: 'error' }))
      }

      utterancesRef.current.push(utt)
    }

    // Chain utterances
    for (let i = 0; i < utterancesRef.current.length; i++) {
      const utt = utterancesRef.current[i]
      if (i < utterancesRef.current.length - 1) {
        utt.onend = () => {
          const next = utterancesRef.current[i + 1]
          if (next) window.speechSynthesis.speak(next)
        }
      }
    }

    setState((s) => ({ ...s, status: 'playing' }))
    if (utterancesRef.current.length > 0) {
      window.speechSynthesis.speak(utterancesRef.current[0])
    }
  }, [])

  // ── Public API ───────────────────────────────────────────────────────────

  const play = useCallback(
    async (fromWordIndex = 0) => {
      const { tone, rate, cache, speechSupported } = stateRef.current
      if (!speechSupported) return

      // Check cache
      if (cache[tone]) {
        const wordSpans = tokenizeWords(cache[tone]!)
        setState((s) => ({ ...s, wordSpans, currentWordIndex: fromWordIndex }))
        speakFromIndex(wordSpans, fromWordIndex, rate)
        return
      }

      // Need to fetch rewrite
      setState((s) => ({ ...s, status: 'rewriting' }))
      try {
        const res = await fetch('/api/read-aloud/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentId, tone }),
        })
        if (!res.ok) {
          setState((s) => ({ ...s, status: 'error' }))
          return
        }
        const data = await res.json()
        const rewrittenText: string = data.rewrittenText
        const wordSpans = tokenizeWords(rewrittenText)
        setState((s) => ({
          ...s,
          cache: { ...s.cache, [tone]: rewrittenText },
          wordSpans,
          currentWordIndex: fromWordIndex,
        }))
        speakFromIndex(wordSpans, fromWordIndex, rate)
      } catch {
        setState((s) => ({ ...s, status: 'error' }))
      }
    },
    [contentId, speakFromIndex]
  )

  const pause = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause()
      setState((s) => ({ ...s, status: 'paused' }))
    }
  }, [])

  const resume = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume()
      setState((s) => ({ ...s, status: 'playing' }))
    }
  }, [])

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setState((s) => ({ ...s, status: 'idle', currentWordIndex: 0, wordSpans: [] }))
  }, [])

  const setTone = useCallback(
    (tone: ToneMode) => {
      const { status, rate, cache } = stateRef.current
      if (status === 'playing' || status === 'paused') {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
      }
      setState((s) => ({ ...s, tone, status: 'idle', currentWordIndex: 0, wordSpans: [] }))
      // Auto-play in new tone if was playing
      if (status === 'playing') {
        // Defer to next tick after state update
        setTimeout(() => {
          if (cache[tone]) {
            const wordSpans = tokenizeWords(cache[tone]!)
            setState((s) => ({ ...s, wordSpans }))
            speakFromIndex(wordSpans, 0, rate)
          } else {
            // will trigger rewrite via play()
            // NOTE: play() reads from stateRef which will have updated tone
          }
        }, 50)
      }
    },
    [speakFromIndex]
  )

  const setRate = useCallback(
    (rate: number) => {
      const { status, wordSpans, currentWordIndex } = stateRef.current
      setState((s) => ({ ...s, rate }))
      if (status === 'playing') {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
        speakFromIndex(wordSpans, currentWordIndex, rate)
      }
    },
    [speakFromIndex]
  )

  const playFromAnchor = useCallback(
    (anchor: SourceAnchor, segments?: TranscriptSegment[], extractedText?: string | null) => {
      const { wordSpans, rate, cache, tone } = stateRef.current
      if (wordSpans.length > 0) {
        const idx = anchorToWordIndex(anchor, wordSpans, segments, extractedText)
        speakFromIndex(wordSpans, idx, rate)
        setState((s) => ({ ...s, currentWordIndex: idx }))
      } else if (cache[tone]) {
        const spans = tokenizeWords(cache[tone]!)
        const idx = anchorToWordIndex(anchor, spans, segments, extractedText)
        setState((s) => ({ ...s, wordSpans: spans, currentWordIndex: idx }))
        speakFromIndex(spans, idx, rate)
      } else {
        play(0)
      }
    },
    [speakFromIndex, play]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return { ...state, play, pause, resume, stop, setTone, setRate, playFromAnchor }
}
