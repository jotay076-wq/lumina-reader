'use client'

import { useRef, useCallback, useEffect } from 'react'
import type { SourceAnchor } from './types'

export interface ConfusionEvent {
  anchorType: 'timestamp' | 'paragraph'
  anchorRef: number
  signalType: 'reread' | 'slow-scroll' | 'repeated-qa'
  passagePreview: string
}

export interface ConfusionDetectorControls {
  onSegmentVisible: (sequence: number, passageText: string) => void
  onParagraphVisible: (paragraphIndex: number, passageText: string) => void
  notifyQaAnchors: (anchors: SourceAnchor[]) => void
  resetPassage: (anchorType: 'timestamp' | 'paragraph', anchorRef: number) => void
}

const SLOW_SCROLL_THRESHOLD_MS = 45_000
const REREAD_THRESHOLD = 2
const REPEATED_QA_THRESHOLD = 2
const SLOW_SCROLL_CHECK_INTERVAL_MS = 5_000

function passageKey(anchorType: 'timestamp' | 'paragraph', anchorRef: number): string {
  return `${anchorType}:${anchorRef}`
}

function preview(text: string): string {
  return text.slice(0, 60).trimEnd() + (text.length > 60 ? '…' : '')
}

export function useConfusionDetector(
  enabled: boolean,
  onConfusion: (event: ConfusionEvent) => void
): ConfusionDetectorControls {
  const onConfusionRef = useRef(onConfusion)
  onConfusionRef.current = onConfusion

  // Re-read tracking
  const seenPassages = useRef<Set<string>>(new Set())
  const rereadCount = useRef<Map<string, number>>(new Map())
  const lastScrollTopRef = useRef<number>(0)
  const currentScrollTopRef = useRef<number>(0)

  // Slow-scroll tracking: key → { entryTime, text }
  const viewportEntries = useRef<Map<string, { entryTime: number; text: string }>>(new Map())

  // Repeated Q&A tracking
  const qaAnchorCount = useRef<Map<string, { count: number; text: string }>>(new Map())

  // Tracks passages that have already fired a confusion event this session
  const firedPassages = useRef<Set<string>>(new Set())

  const emit = useCallback(
    (event: ConfusionEvent) => {
      const key = passageKey(event.anchorType, event.anchorRef)
      if (firedPassages.current.has(key)) return
      firedPassages.current.add(key)
      onConfusionRef.current(event)
    },
    []
  )

  const onSegmentVisible = useCallback(
    (sequence: number, passageText: string) => {
      if (!enabled) return
      const key = passageKey('timestamp', sequence)
      const scrollingUp = currentScrollTopRef.current < lastScrollTopRef.current

      if (seenPassages.current.has(key) && scrollingUp) {
        const count = (rereadCount.current.get(key) ?? 0) + 1
        rereadCount.current.set(key, count)
        if (count >= REREAD_THRESHOLD) {
          rereadCount.current.set(key, 0)
          emit({ anchorType: 'timestamp', anchorRef: sequence, signalType: 'reread', passagePreview: preview(passageText) })
        }
      } else if (!scrollingUp) {
        seenPassages.current.add(key)
      }

      // Slow-scroll: record entry time when newly entering viewport
      if (!viewportEntries.current.has(key)) {
        viewportEntries.current.set(key, { entryTime: Date.now(), text: passageText })
      }
    },
    [enabled, emit]
  )

  const onParagraphVisible = useCallback(
    (paragraphIndex: number, passageText: string) => {
      if (!enabled) return
      const key = passageKey('paragraph', paragraphIndex)
      const scrollingUp = currentScrollTopRef.current < lastScrollTopRef.current

      if (seenPassages.current.has(key) && scrollingUp) {
        const count = (rereadCount.current.get(key) ?? 0) + 1
        rereadCount.current.set(key, count)
        if (count >= REREAD_THRESHOLD) {
          rereadCount.current.set(key, 0)
          emit({ anchorType: 'paragraph', anchorRef: paragraphIndex, signalType: 'reread', passagePreview: preview(passageText) })
        }
      } else if (!scrollingUp) {
        seenPassages.current.add(key)
      }

      if (!viewportEntries.current.has(key)) {
        viewportEntries.current.set(key, { entryTime: Date.now(), text: passageText })
      }
    },
    [enabled, emit]
  )

  const notifyQaAnchors = useCallback(
    (anchors: SourceAnchor[]) => {
      if (!enabled) return
      for (const anchor of anchors) {
        const ref = anchor.type === 'timestamp' ? anchor.sequence : anchor.paragraph_index
        const key = passageKey(anchor.type, ref as number)
        const existing = qaAnchorCount.current.get(key) ?? { count: 0, text: '' }
        const count = existing.count + 1
        qaAnchorCount.current.set(key, { count, text: existing.text || key })
        if (count >= REPEATED_QA_THRESHOLD) {
          qaAnchorCount.current.set(key, { count: 0, text: existing.text })
          emit({
            anchorType: anchor.type,
            anchorRef: ref as number,
            signalType: 'repeated-qa',
            passagePreview: existing.text || key,
          })
        }
      }
    },
    [enabled, emit]
  )

  const resetPassage = useCallback(
    (anchorType: 'timestamp' | 'paragraph', anchorRef: number) => {
      const key = passageKey(anchorType, anchorRef)
      rereadCount.current.set(key, 0)
      qaAnchorCount.current.delete(key)
      viewportEntries.current.delete(key)
      firedPassages.current.delete(key)
    },
    []
  )

  // Scroll direction tracking — caller must set currentScrollTopRef via the exported setter
  // We expose a scroll handler the caller attaches to the scroll container
  const handleScroll = useCallback((e: Event) => {
    const el = e.target as HTMLElement
    lastScrollTopRef.current = currentScrollTopRef.current
    currentScrollTopRef.current = el.scrollTop
  }, [])

  // Slow-scroll interval
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of viewportEntries.current.entries()) {
        if (now - entry.entryTime >= SLOW_SCROLL_THRESHOLD_MS) {
          viewportEntries.current.delete(key)
          const [anchorType, anchorRefStr] = key.split(':') as ['timestamp' | 'paragraph', string]
          const anchorRef = parseInt(anchorRefStr, 10)
          emit({ anchorType, anchorRef, signalType: 'slow-scroll', passagePreview: preview(entry.text) })
        }
      }
    }, SLOW_SCROLL_CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, emit])

  // Expose scroll handler so the reader page can attach it
  useEffect(() => {
    // Store on window so SourcePanel can find it without prop drilling
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__confusionScrollHandler = enabled ? handleScroll : null
  }, [enabled, handleScroll])

  return { onSegmentVisible, onParagraphVisible, notifyQaAnchors, resetPassage }
}
