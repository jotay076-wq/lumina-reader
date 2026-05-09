'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { ContentType, ContentStatus, TranscriptSegment, EbookChapter, SummaryResponse, TutorCard, TutorStyle, SourceAnchor } from '@/lib/types'
import { useReadAloud, TONE_LABELS, SPEED_OPTIONS } from '@/lib/use-read-aloud'
import type { ReadAloudControls, ToneMode } from '@/lib/use-read-aloud'
import { useConfusionDetector } from '@/lib/use-confusion-detector'
import type { ConfusionEvent } from '@/lib/use-confusion-detector'
import TutorTab from '@/components/TutorTab'

interface ContentData {
  contentId: string
  contentType: ContentType
  status: ContentStatus
  title: string
  sourceUrl: string | null
  extractedText: string | null
  segments: TranscriptSegment[] | null
  chapters: EbookChapter[] | null
  errorCode: string | null
  createdAt: string
}

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 100 // 5 minutes

const TYPE_LABELS: Record<ContentType, string> = {
  youtube: 'YouTube',
  website: 'Website',
  pdf: 'PDF',
  audio: 'Audio',
  ebook: 'eBook',
}

const TYPE_ICONS: Record<ContentType, string> = {
  youtube: '▶',
  website: '🌐',
  pdf: '📄',
  audio: '🎵',
  ebook: '📚',
}

export default function ReaderPage() {
  const { contentId } = useParams<{ contentId: string }>()
  const [data, setData] = useState<ContentData | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [pollTimeout, setPollTimeout] = useState(false)
  const pollCountRef = useRef(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  async function fetchContent() {
    try {
      const res = await fetch(`/api/content/${contentId}`)
      if (!res.ok) {
        setFetchError('Content not found or access denied.')
        return null
      }
      const json: ContentData = await res.json()
      setData(json)
      return json
    } catch {
      setFetchError('Failed to load content.')
      return null
    }
  }

  useEffect(() => {
    fetchContent().then((initial) => {
      if (!initial || initial.status !== 'processing') return

      intervalRef.current = setInterval(async () => {
        pollCountRef.current++
        if (pollCountRef.current >= MAX_POLLS) {
          clearInterval(intervalRef.current!)
          setPollTimeout(true)
          return
        }
        const updated = await fetchContent()
        if (updated && updated.status !== 'processing') {
          clearInterval(intervalRef.current!)
        }
      }, POLL_INTERVAL_MS)
    })

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId])

  if (fetchError) {
    return <ErrorState message={fetchError} />
  }

  if (!data) {
    return <LoadingShell message="Loading content…" />
  }

  if (data.status === 'error') {
    return (
      <ErrorState
        message={
          data.errorCode === 'TRANSCRIPT_UNAVAILABLE'
            ? 'No captions available for this YouTube video.'
            : data.errorCode === 'FETCH_TIMEOUT'
            ? 'The website took too long to respond.'
            : `Processing failed: ${data.errorCode ?? 'Unknown error'}`
        }
      />
    )
  }

  if (data.status === 'processing') {
    if (pollTimeout) {
      return (
        <ErrorState message="Transcription is taking longer than expected — refresh to check again." />
      )
    }

    const isAudio = data.contentType === 'audio'
    return (
      <LoadingShell
        message={isAudio ? 'Transcribing audio…' : 'Processing content…'}
        subMessage={isAudio ? 'Groq Whisper is transcribing your audio file. This may take a moment.' : undefined}
        contentType={data.contentType}
        title={data.title}
      />
    )
  }

  // status === 'complete'
  return <ReaderLayout data={data} />
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingShell({
  message,
  subMessage,
  contentType,
  title,
}: {
  message: string
  subMessage?: string
  contentType?: ContentType
  title?: string
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', maxWidth: '400px', textAlign: 'center' }}>
        {contentType && (
          <span style={{ fontSize: '32px' }}>{TYPE_ICONS[contentType]}</span>
        )}
        <div style={{
          width: '36px', height: '36px', border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {title && <p style={{ fontSize: '15px', fontWeight: 600 }}>{title}</p>}
        <p style={{ color: 'var(--muted)', fontSize: '14px' }}>{message}</p>
        {subMessage && <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{subMessage}</p>}
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '16px',
    }}>
      <span style={{ fontSize: '32px' }}>⚠️</span>
      <p style={{ color: 'var(--red)', fontSize: '15px', textAlign: 'center', maxWidth: '400px' }}>{message}</p>
      <a href="/" style={{ fontSize: '13px', color: 'var(--accent)' }}>← Back to home</a>
    </div>
  )
}

function ReaderLayout({ data }: { data: ContentData }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const summaryPollRef = useRef<NodeJS.Timeout | null>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLIFrameElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const readAloud = useReadAloud({ contentId: data.contentId, contentStatus: data.status })

  // Tutor state
  const [tutorCards, setTutorCards] = useState<TutorCard[]>([])
  const [activeConfusion, setActiveConfusion] = useState<ConfusionEvent | null>(null)
  const [explainStatus, setExplainStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const confusionQueueRef = useRef<ConfusionEvent[]>([])
  const sessionExplainCacheRef = useRef<Map<string, TutorCard>>(new Map())

  const confusionDetector = useConfusionDetector(
    data.status === 'complete',
    useCallback((event: ConfusionEvent) => {
      setActiveConfusion((prev) => {
        if (prev === null) return event
        confusionQueueRef.current.push(event)
        return prev
      })
    }, [])
  )

  // Restore tutor cards on mount
  useEffect(() => {
    fetch(`/api/tutor/${data.contentId}`)
      .then((r) => r.ok ? r.json() : { cards: [] })
      .then((d: { cards: TutorCard[] }) => setTutorCards(d.cards ?? []))
      .catch(() => {})
  }, [data.contentId])

  // IntersectionObserver for confusion detection
  useEffect(() => {
    if (data.status !== 'complete' || !leftPanelRef.current) return

    const observers: IntersectionObserver[] = []

    // Observe transcript segments
    const segRows = leftPanelRef.current.querySelectorAll<HTMLElement>('.seg-row[data-sequence]')
    segRows.forEach((el) => {
      const sequence = parseInt(el.dataset.sequence ?? '0', 10)
      const text = el.querySelector('span:last-of-type')?.textContent ?? ''
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) confusionDetector.onSegmentVisible(sequence, text) },
        { threshold: 0.5 }
      )
      obs.observe(el)
      observers.push(obs)
    })

    // Observe paragraphs
    const paraRows = leftPanelRef.current.querySelectorAll<HTMLElement>('.para-row[data-paragraph-index]')
    paraRows.forEach((el) => {
      const idx = parseInt(el.dataset.paragraphIndex ?? '0', 10)
      const text = el.querySelector('p')?.textContent ?? ''
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) confusionDetector.onParagraphVisible(idx, text) },
        { threshold: 0.5 }
      )
      obs.observe(el)
      observers.push(obs)
    })

    // Attach scroll handler for direction tracking
    const scrollEl = leftPanelRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (window as any).__confusionScrollHandler
    if (handler) scrollEl.addEventListener('scroll', handler)

    return () => {
      observers.forEach((obs) => obs.disconnect())
      if (handler) scrollEl.removeEventListener('scroll', handler)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status, data.segments, data.extractedText])

  async function handleStyleSelect(style: TutorStyle) {
    if (!activeConfusion) return
    const cacheKey = `${data.contentId}:${activeConfusion.anchorType}:${activeConfusion.anchorRef}:${style}`
    const cached = sessionExplainCacheRef.current.get(cacheKey)
    if (cached) {
      setTutorCards((prev) => [cached, ...prev.filter((c) => c.cardId !== cached.cardId)])
      confusionDetector.resetPassage(activeConfusion.anchorType, activeConfusion.anchorRef)
      setActiveConfusion(confusionQueueRef.current.shift() ?? null)
      return
    }
    setExplainStatus('loading')
    try {
      const res = await fetch('/api/tutor/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: data.contentId,
          anchorType: activeConfusion.anchorType,
          anchorRef: activeConfusion.anchorRef,
          style,
        }),
      })
      if (!res.ok) { setExplainStatus('error'); return }
      const card: TutorCard = await res.json()
      sessionExplainCacheRef.current.set(cacheKey, card)
      setTutorCards((prev) => [card, ...prev])
      setExplainStatus('idle')
      confusionDetector.resetPassage(activeConfusion.anchorType, activeConfusion.anchorRef)
      setActiveConfusion(confusionQueueRef.current.shift() ?? null)
    } catch {
      setExplainStatus('error')
    }
  }

  function handleDismiss() {
    if (activeConfusion) {
      confusionDetector.resetPassage(activeConfusion.anchorType, activeConfusion.anchorRef)
    }
    setExplainStatus('idle')
    setActiveConfusion(confusionQueueRef.current.shift() ?? null)
  }

  function handleQaAnswer(anchors: SourceAnchor[]) {
    confusionDetector.notifyQaAnchors(anchors)
  }

  // Fetch existing summary on mount
  useEffect(() => {
    fetch(`/api/summarize/${data.contentId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json: SummaryResponse | null) => {
        if (!json) return
        if (json.status === 'complete') {
          setSummary(json)
        } else if (json.status === 'processing') {
          setSummaryStatus('loading')
          startSummaryPoll(data.contentId)
        } else if (json.status === 'error') {
          setSummaryStatus('error')
        }
      })
      .catch(() => {})
    return () => { if (summaryPollRef.current) clearInterval(summaryPollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.contentId])

  function startSummaryPoll(contentId: string) {
    if (summaryPollRef.current) clearInterval(summaryPollRef.current)
    summaryPollRef.current = setInterval(async () => {
      const res = await fetch(`/api/summarize/${contentId}`)
      if (!res.ok) return
      const json: SummaryResponse = await res.json()
      if (json.status === 'complete') {
        clearInterval(summaryPollRef.current!)
        setSummary(json)
        setSummaryStatus('idle')
      } else if (json.status === 'error') {
        clearInterval(summaryPollRef.current!)
        setSummaryStatus('error')
      }
    }, 2000)
  }

  async function triggerSummarize() {
    setSummaryStatus('loading')
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId: data.contentId }),
    })
    if (res.ok || res.status === 202) {
      startSummaryPoll(data.contentId)
    } else if (res.status === 409) {
      // Summary exists — fetch it
      const existing = await fetch(`/api/summarize/${data.contentId}`)
      if (existing.ok) {
        const json: SummaryResponse = await existing.json()
        if (json.status === 'complete') { setSummary(json); setSummaryStatus('idle') }
        else if (json.status === 'processing') startSummaryPoll(data.contentId)
      }
    } else {
      setSummaryStatus('error')
    }
  }

  const jumpToTimestamp = useCallback((startSeconds: number, _sequence?: number) => {
    if (playerRef.current) {
      playerRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [startSeconds, true] }),
        '*'
      )
    }
    if (audioRef.current) {
      audioRef.current.currentTime = startSeconds
    }
    // Scroll transcript segment into view
    const el = document.querySelector(`[data-sequence="${Math.round(startSeconds)}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('pulse-highlight')
    setTimeout(() => el?.classList.remove('pulse-highlight'), 1200)
  }, [])

  const jumpToParagraph = useCallback((paragraphIndex: number) => {
    const el = document.querySelector(`[data-paragraph-index="${paragraphIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('pulse-highlight')
    setTimeout(() => el?.classList.remove('pulse-highlight'), 1200)
  }, [])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '15px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Lumina
          </a>
          <span style={{ color: 'var(--border)' }}>›</span>
          <span style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.title}
          </span>
        </div>
        <ContentTypeBadge type={data.contentType} />
      </header>

      {/* Split panel */}
      <div style={{ flex: 1, display: 'flex', gap: 0, flexDirection: 'row' }}>
        {/* Left panel — source content */}
        <div style={{ width: '60%', minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
          <div
            ref={leftPanelRef}
            style={{ flex: 1, overflowY: 'auto', padding: '24px' }}
          >
            <SourcePanel
              data={data}
              summary={summary}
              playerRef={playerRef}
              audioRef={audioRef}
              readAloud={readAloud}
            />
          </div>
          <ReadAloudBar readAloud={readAloud} contentStatus={data.status} />
        </div>

        {/* Right panel — AI tools dock */}
        <div style={{ width: '40%', minWidth: 0, overflowY: 'auto', padding: '24px' }}>
          <AiDock
            data={data}
            summary={summary}
            summaryStatus={summaryStatus}
            onSummarize={triggerSummarize}
            onRetry={triggerSummarize}
            jumpToTimestamp={jumpToTimestamp}
            jumpToParagraph={jumpToParagraph}
            tutorCards={tutorCards}
            activeConfusion={activeConfusion}
            explainStatus={explainStatus}
            onStyleSelect={handleStyleSelect}
            onDismiss={handleDismiss}
            onQaAnswer={handleQaAnswer}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .reader-split { flex-direction: column !important; }
          .reader-left { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border); }
          .reader-right { width: 100% !important; }
        }
        @keyframes pulseHighlightAnim {
          0%   { background: hsla(258,80%,65%,0.4); }
          100% { background: transparent; }
        }
        .pulse-highlight { animation: pulseHighlightAnim 1.2s ease-out; }
        .highlight-key-insight { background: hsla(258,80%,65%,0.2); border-bottom: 1px solid hsla(258,80%,65%,0.5); border-radius: 2px; cursor: pointer; }
        .highlight-definition  { background: hsla(168,80%,45%,0.15); border-bottom: 1px solid hsla(168,80%,45%,0.4); border-radius: 2px; cursor: pointer; }
        .highlight-conclusion  { background: hsla(45,90%,55%,0.15);  border-bottom: 1px solid hsla(45,90%,55%,0.4);  border-radius: 2px; cursor: pointer; }
        .seg-row { position: relative; }
        .seg-row .play-from-btn { opacity: 0; transition: opacity 0.15s; }
        .seg-row:hover .play-from-btn { opacity: 1; }
        .para-row { position: relative; }
        .para-row .play-from-btn { opacity: 0; transition: opacity 0.15s; }
        .para-row:hover .play-from-btn { opacity: 1; }
        .play-from-btn { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
        .word-active { background: hsla(258,80%,65%,0.4); border-radius: 3px; font-weight: 600; }
      `}</style>
    </div>
  )
}

function ContentTypeBadge({ type }: { type: ContentType }) {
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px',
      background: 'var(--accent-dim)', color: 'var(--accent)',
      border: '1px solid rgba(124,90,246,0.3)',
    }}>
      {TYPE_ICONS[type]} {TYPE_LABELS[type]}
    </span>
  )
}

function ProcessingCompleteBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px',
      background: 'rgba(34,197,94,0.1)', color: 'var(--green)',
      border: '1px solid rgba(34,197,94,0.25)',
    }}>
      ✓ Processing complete
    </span>
  )
}

function SourcePanel({
  data,
  summary,
  playerRef,
  audioRef,
  readAloud,
}: {
  data: ContentData
  summary: SummaryResponse | null
  playerRef: React.RefObject<HTMLIFrameElement | null>
  audioRef: React.RefObject<HTMLAudioElement | null>
  readAloud: ReadAloudControls
}) {
  return (
    <div>
      {/* Title + source info + status badge */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px', lineHeight: 1.3 }}>{data.title}</h1>
        {data.sourceUrl && (
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '12px', color: 'var(--muted)', wordBreak: 'break-all' }}
          >
            {data.sourceUrl}
          </a>
        )}
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <ContentTypeBadge type={data.contentType} />
          <ProcessingCompleteBadge />
        </div>
      </div>

      {/* YouTube: embedded player + transcript */}
      {data.contentType === 'youtube' && data.sourceUrl && (
        <YouTubePanel sourceUrl={data.sourceUrl} segments={data.segments ?? []} summary={summary} playerRef={playerRef} readAloud={readAloud} />
      )}

      {/* Audio: HTML5 player + transcript */}
      {data.contentType === 'audio' && (
        <AudioPanel segments={data.segments ?? []} storagePath={null} summary={summary} audioRef={audioRef} readAloud={readAloud} />
      )}

      {/* Website / PDF / eBook: rendered text */}
      {(data.contentType === 'website' || data.contentType === 'pdf' || data.contentType === 'ebook') && (
        <TextPanel text={data.extractedText ?? ''} chapters={data.chapters} summary={summary} readAloud={readAloud} />
      )}
    </div>
  )
}

function YouTubePanel({
  sourceUrl,
  segments,
  summary,
  playerRef,
  readAloud,
}: {
  sourceUrl: string
  segments: TranscriptSegment[]
  summary: SummaryResponse | null
  playerRef: React.RefObject<HTMLIFrameElement | null>
  readAloud: ReadAloudControls
}) {
  const videoId = sourceUrl.match(/(?:[?&]v=|youtu\.be\/)([^&?]+)/)?.[1] ?? ''
  return (
    <div>
      {videoId && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, marginBottom: '20px', borderRadius: '12px', overflow: 'hidden' }}>
          <iframe
            ref={playerRef}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            allowFullScreen
            title="YouTube video"
          />
        </div>
      )}
      <TranscriptList segments={segments} summary={summary} readAloud={readAloud} />
    </div>
  )
}

function AudioPanel({
  segments,
  summary,
  audioRef,
  readAloud,
}: {
  segments: TranscriptSegment[]
  storagePath: string | null
  summary: SummaryResponse | null
  audioRef: React.RefObject<HTMLAudioElement | null>
  readAloud: ReadAloudControls
}) {
  return (
    <div>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ color: 'var(--muted)', fontSize: '20px' }}>🎵</span>
        <audio ref={audioRef} controls style={{ flex: 1 }} />
      </div>
      <TranscriptList segments={segments} summary={summary} readAloud={readAloud} />
    </div>
  )
}

function TranscriptList({ segments, summary, readAloud }: { segments: TranscriptSegment[]; summary: SummaryResponse | null; readAloud: ReadAloudControls }) {
  const [tooltip, setTooltip] = useState<{ highlightId: string; x: number; y: number } | null>(null)
  const isKaraoke = (readAloud.status === 'playing' || readAloud.status === 'paused') && readAloud.wordSpans.length > 0

  // Build a map from sequence → highlights for quick lookup
  const highlightsBySeq = new Map<number, SummaryResponse['highlights']>()
  if (summary) {
    for (const h of summary.highlights) {
      if (h.anchor.type === 'timestamp') {
        const seq = h.anchor.sequence
        if (!highlightsBySeq.has(seq)) highlightsBySeq.set(seq, [])
        highlightsBySeq.get(seq)!.push(h)
      }
    }
  }

  function getHighlightClass(category: string) {
    if (category === 'key_insight') return 'highlight-key-insight'
    if (category === 'definition') return 'highlight-definition'
    return 'highlight-conclusion'
  }

  const activeHighlight = tooltip
    ? summary?.highlights.find((h) => h.id === tooltip.highlightId)
    : null
  const linkedPoint = activeHighlight && summary
    ? summary.summaryPoints.find((sp) => {
        if (sp.anchor.type !== 'timestamp' || activeHighlight.anchor.type !== 'timestamp') return false
        return sp.anchor.sequence === activeHighlight.anchor.sequence
      })
    : null

  if (segments.length === 0) return <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No transcript segments available.</p>

  if (isKaraoke) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
          Transcript
        </h3>
        <KaraokeView wordSpans={readAloud.wordSpans} currentWordIndex={readAloud.currentWordIndex} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        Transcript
      </h3>
      {tooltip && activeHighlight && (
        <div
          style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y - 8, transform: 'translateY(-100%)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '10px 14px', maxWidth: '280px', zIndex: 50, fontSize: '12px', lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: '4px', textTransform: 'capitalize' }}>
            {activeHighlight.category.replace('_', ' ')}
          </p>
          {linkedPoint && <p style={{ color: 'var(--text)' }}>{linkedPoint.text}</p>}
        </div>
      )}
      {segments.map((s) => {
        const segHighlights = highlightsBySeq.get(s.sequence) ?? []
        let content: React.ReactNode = s.text
        if (segHighlights.length > 0) {
          // Apply first matching highlight as a mark span (simple: wrap full segment text)
          const h = segHighlights[0]
          const idx = s.text.indexOf(h.text)
          if (idx >= 0) {
            content = (
              <>
                {s.text.slice(0, idx)}
                <mark
                  className={getHighlightClass(h.category)}
                  data-highlight-id={h.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTooltip({ highlightId: h.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  {h.text}
                </mark>
                {s.text.slice(idx + h.text.length)}
              </>
            )
          }
        }
        return (
          <div
            key={s.sequence}
            className="seg-row"
            data-sequence={s.sequence}
            style={{ display: 'flex', gap: '10px', fontSize: '13px', lineHeight: 1.6, paddingRight: '28px' }}
          >
            <span style={{ color: 'var(--accent)', flexShrink: 0, minWidth: '44px', fontSize: '11px', paddingTop: '2px' }}>
              {formatTime(s.start)}
            </span>
            <span>{content}</span>
            <button
              className="play-from-btn"
              onClick={() => readAloud.playFromAnchor(
                { type: 'timestamp', start_seconds: s.start, sequence: s.sequence },
                segments,
                null
              )}
              title="Play from here"
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '5px', color: 'var(--accent)', fontSize: '10px',
                padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ▶
            </button>
          </div>
        )
      })}
      {tooltip && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={() => setTooltip(null)}
          onKeyDown={(e) => e.key === 'Escape' && setTooltip(null)}
        />
      )}
    </div>
  )
}

function TextPanel({
  text,
  chapters,
  summary,
  readAloud,
}: {
  text: string
  chapters: EbookChapter[] | null
  summary: SummaryResponse | null
  readAloud: ReadAloudControls
}) {
  const [tooltip, setTooltip] = useState<{ highlightId: string; x: number; y: number } | null>(null)
  const isKaraoke = (readAloud.status === 'playing' || readAloud.status === 'paused') && readAloud.wordSpans.length > 0

  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)

  // Build map from paragraph_index → highlights
  const highlightsByPara = new Map<number, SummaryResponse['highlights']>()
  if (summary) {
    for (const h of summary.highlights) {
      if (h.anchor.type === 'paragraph') {
        const idx = h.anchor.paragraph_index
        if (!highlightsByPara.has(idx)) highlightsByPara.set(idx, [])
        highlightsByPara.get(idx)!.push(h)
      }
    }
  }

  function getHighlightClass(category: string) {
    if (category === 'key_insight') return 'highlight-key-insight'
    if (category === 'definition') return 'highlight-definition'
    return 'highlight-conclusion'
  }

  const activeHighlight = tooltip
    ? summary?.highlights.find((h) => h.id === tooltip.highlightId)
    : null
  const linkedPoint = activeHighlight && summary
    ? summary.summaryPoints.find((sp) => {
        if (sp.anchor.type !== 'paragraph' || activeHighlight.anchor.type !== 'paragraph') return false
        return sp.anchor.paragraph_index === activeHighlight.anchor.paragraph_index
      })
    : null

  function renderParagraph(paraText: string, paraIndex: number): React.ReactNode {
    const paraHighlights = highlightsByPara.get(paraIndex) ?? []
    if (paraHighlights.length === 0) return paraText

    // Build segments with marks
    let remaining = paraText
    const parts: React.ReactNode[] = []
    let offset = 0

    for (const h of paraHighlights) {
      const idx = remaining.indexOf(h.text)
      if (idx < 0) continue
      if (idx > 0) parts.push(<span key={offset}>{remaining.slice(0, idx)}</span>)
      parts.push(
        <mark
          key={h.id}
          className={getHighlightClass(h.category)}
          data-highlight-id={h.id}
          onClick={(e) => {
            e.stopPropagation()
            setTooltip({ highlightId: h.id, x: e.clientX, y: e.clientY })
          }}
        >
          {h.text}
        </mark>
      )
      remaining = remaining.slice(idx + h.text.length)
      offset++
    }
    if (remaining) parts.push(<span key="tail">{remaining}</span>)
    return parts
  }

  if (isKaraoke) {
    return <KaraokeView wordSpans={readAloud.wordSpans} currentWordIndex={readAloud.currentWordIndex} />
  }

  if (chapters && chapters.length > 0) {
    return (
      <div>
        {chapters.map((ch) => (
          <div key={ch.chapterIndex} style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>{ch.title}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{ch.text}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {tooltip && activeHighlight && (
        <div
          style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y - 8, transform: 'translateY(-100%)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '10px 14px', maxWidth: '280px', zIndex: 50, fontSize: '12px', lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: '4px', textTransform: 'capitalize' }}>
            {activeHighlight.category.replace('_', ' ')}
          </p>
          {linkedPoint && <p style={{ color: 'var(--text)' }}>{linkedPoint.text}</p>}
        </div>
      )}
      {paragraphs.map((para, i) => (
        <div
          key={i}
          className="para-row"
          data-paragraph-index={i}
          style={{ marginBottom: '16px', paddingRight: '28px' }}
        >
          <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'var(--text)', margin: 0 }}>
            {renderParagraph(para, i)}
          </p>
          <button
            className="play-from-btn"
            onClick={() => readAloud.playFromAnchor(
              { type: 'paragraph', paragraph_index: i },
              undefined,
              text
            )}
            title="Play from here"
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '5px', color: 'var(--accent)', fontSize: '10px',
              padding: '2px 6px', cursor: 'pointer',
            }}
          >
            ▶
          </button>
        </div>
      ))}
      {tooltip && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={() => setTooltip(null)}
          onKeyDown={(e) => e.key === 'Escape' && setTooltip(null)}
        />
      )}
    </div>
  )
}

function AiDock({
  data,
  summary,
  summaryStatus,
  onSummarize,
  onRetry,
  jumpToTimestamp,
  jumpToParagraph,
  tutorCards,
  activeConfusion,
  explainStatus,
  onStyleSelect,
  onDismiss,
  onQaAnswer,
}: {
  data: ContentData
  summary: SummaryResponse | null
  summaryStatus: 'idle' | 'loading' | 'error'
  onSummarize: () => void
  onRetry: () => void
  jumpToTimestamp: (startSeconds: number, sequence?: number) => void
  jumpToParagraph: (paragraphIndex: number) => void
  tutorCards: TutorCard[]
  activeConfusion: ConfusionEvent | null
  explainStatus: 'idle' | 'loading' | 'error'
  onStyleSelect: (style: TutorStyle) => void
  onDismiss: () => void
  onQaAnswer: (anchors: SourceAnchor[]) => void
}) {
  const [activeTab, setActiveTab] = useState<'summary' | 'qa' | 'tutor'>('summary')
  const tabs = [
    { id: 'summary' as const, label: 'Summary' },
    { id: 'qa' as const, label: 'Q&A' },
    { id: 'tutor' as const, label: 'Tutor' },
  ]

  return (
    <div>
      <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        AI Tools
      </h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', borderRadius: '10px', padding: '4px', marginBottom: '16px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '7px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <SummaryTab
          summary={summary}
          summaryStatus={summaryStatus}
          onSummarize={onSummarize}
          onRetry={onRetry}
          jumpToTimestamp={jumpToTimestamp}
          jumpToParagraph={jumpToParagraph}
        />
      )}

      {activeTab === 'qa' && (
        <QaTab
          contentId={data.contentId}
          jumpToTimestamp={jumpToTimestamp}
          jumpToParagraph={jumpToParagraph}
          onAnswerReceived={onQaAnswer}
        />
      )}

      {activeTab === 'tutor' && (
        <TutorTab
          contentId={data.contentId}
          contentStatus={data.status}
          activeConfusion={activeConfusion}
          onStyleSelect={onStyleSelect}
          onDismiss={onDismiss}
          cards={tutorCards}
          explainStatus={explainStatus}
          jumpToTimestamp={(s, seq) => jumpToTimestamp(s, seq)}
          jumpToParagraph={jumpToParagraph}
        />
      )}

    </div>
  )
}

function SummaryTab({
  summary,
  summaryStatus,
  onSummarize,
  onRetry,
  jumpToTimestamp,
  jumpToParagraph,
}: {
  summary: SummaryResponse | null
  summaryStatus: 'idle' | 'loading' | 'error'
  onSummarize: () => void
  onRetry: () => void
  jumpToTimestamp: (startSeconds: number, sequence: number) => void
  jumpToParagraph: (paragraphIndex: number) => void
}) {
  // Loading skeleton
  if (summaryStatus === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} width={i % 2 === 0 ? '85%' : '100%'} />
        ))}
      </div>
    )
  }

  // Error state
  if (summaryStatus === 'error') {
    return (
      <div style={{
        border: '1px solid var(--border)', borderRadius: '12px', padding: '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center',
      }}>
        <span style={{ fontSize: '24px' }}>⚠️</span>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Summarization failed. Tap Retry to try again.</p>
        <button
          onClick={onRetry}
          style={{
            padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--accent)',
            background: 'transparent', color: 'var(--accent)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  // Empty state — no summary yet
  if (!summary || summary.summaryPoints.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px 16px', textAlign: 'center' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'hsla(258,80%,55%,0.1)', border: '1px solid hsla(258,80%,55%,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
        }}>
          ✨
        </div>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Ready to summarize</p>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '240px' }}>
            Generate an AI summary grounded entirely in this content — every point links back to the exact source.
          </p>
        </div>
        <button
          onClick={onSummarize}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, hsl(258,75%,55%), hsl(258,70%,45%))',
            color: 'white', fontSize: '13px', fontWeight: 600,
            boxShadow: '0 4px 16px hsla(258,75%,55%,0.4)',
          }}
        >
          ✨ Summarize
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
          {['Source-anchored', 'Jump to source', 'Smart highlights'].map((pill) => (
            <span key={pill} style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '999px',
              background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)',
            }}>
              {pill}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Populated summary list
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {summary.summaryPoints.map((point) => {
        const anchor = point.anchor
        const label = anchor.type === 'timestamp'
          ? formatTime(anchor.start_seconds)
          : `¶ ${anchor.paragraph_index + 1}`

        function handleJump() {
          if (anchor.type === 'timestamp') {
            jumpToTimestamp(anchor.start_seconds, anchor.sequence)
          } else {
            jumpToParagraph(anchor.paragraph_index)
          }
        }

        return (
          <div
            key={point.id}
            style={{
              padding: '12px 14px', borderRadius: '10px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}
          >
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>{point.text}</p>
            <button
              onClick={handleJump}
              style={{
                alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--accent)', fontSize: '11px',
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              ↗ {label}
            </button>
          </div>
        )
      })}

      <button
        onClick={onSummarize}
        style={{
          marginTop: '4px', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer',
          alignSelf: 'center',
        }}
      >
        Regenerate
      </button>
    </div>
  )
}

function SkeletonCard({ width }: { width: string }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: '10px',
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{
        height: '13px', borderRadius: '6px', width,
        background: 'linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }} />
      <div style={{
        height: '13px', borderRadius: '6px', width: '70%',
        background: 'linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite 0.2s',
      }} />
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }`}</style>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Read Aloud ───────────────────────────────────────────────────────────────

function KaraokeView({ wordSpans, currentWordIndex }: { wordSpans: string[]; currentWordIndex: number }) {
  return (
    <div style={{ fontSize: '14px', lineHeight: 2, color: 'var(--text)' }}>
      {wordSpans.map((word, i) => (
        <span
          key={i}
          data-word-index={i}
          className={i === currentWordIndex ? 'word-active' : undefined}
          style={{ display: 'inline', padding: '1px 2px', transition: 'background 0.1s' }}
        >
          {word}{' '}
        </span>
      ))}
    </div>
  )
}

function ReadAloudBar({ readAloud, contentStatus }: { readAloud: ReadAloudControls; contentStatus: string }) {
  const { status, tone, rate, wordSpans, currentWordIndex, speechSupported } = readAloud
  const notSupported = !speechSupported
  const notReady = contentStatus !== 'complete'
  const disabled = notSupported || notReady || status === 'rewriting'

  return (
    <div style={{
      borderTop: '1px solid var(--border)', background: 'var(--surface)',
      padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0,
    }}>
      {/* Status messages */}
      {notSupported && (
        <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
          Text-to-speech is not supported in this browser.
        </p>
      )}
      {!notSupported && notReady && (
        <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
          Content still processing — playback unavailable.
        </p>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Tone selector pills */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', flex: 1 }}>
          {(Object.entries(TONE_LABELS) as [ToneMode, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => readAloud.setTone(t)}
              disabled={notSupported || notReady}
              style={{
                padding: '3px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 500,
                border: tone === t ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: tone === t ? 'var(--accent-dim)' : 'transparent',
                color: tone === t ? 'var(--accent)' : 'var(--muted)',
                cursor: (notSupported || notReady) ? 'not-allowed' : 'pointer',
                opacity: (notSupported || notReady) ? 0.5 : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Speed selector */}
        <select
          value={rate}
          onChange={(e) => readAloud.setRate(Number(e.target.value))}
          disabled={notSupported || notReady}
          style={{
            padding: '3px 6px', borderRadius: '6px', fontSize: '11px',
            border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
            cursor: (notSupported || notReady) ? 'not-allowed' : 'pointer',
            opacity: (notSupported || notReady) ? 0.5 : 1,
          }}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>

        {/* Rewriting indicator */}
        {status === 'rewriting' && (
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Rewriting…</span>
        )}

        {/* Error retry */}
        {status === 'error' && (
          <button
            onClick={() => readAloud.play(currentWordIndex)}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--red, #ef4444)',
              background: 'transparent', color: 'var(--red, #ef4444)', fontSize: '11px', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}

        {/* Stop button */}
        {(status === 'playing' || status === 'paused') && (
          <button
            onClick={readAloud.stop}
            style={{
              width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '11px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            ■
          </button>
        )}

        {/* Play / Pause button */}
        <button
          onClick={() => {
            if (status === 'playing') readAloud.pause()
            else if (status === 'paused') readAloud.resume()
            else readAloud.play()
          }}
          disabled={disabled}
          style={{
            width: '32px', height: '32px', borderRadius: '8px', border: 'none', flexShrink: 0,
            background: disabled
              ? 'var(--border)'
              : 'linear-gradient(135deg, hsl(258,75%,55%), hsl(258,70%,45%))',
            color: 'white', fontSize: '13px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label={status === 'playing' ? 'Pause' : 'Play'}
        >
          {status === 'playing' ? '⏸' : '▶'}
        </button>
      </div>

      {/* Word progress bar */}
      {(status === 'playing' || status === 'paused') && wordSpans.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--border)', borderRadius: '1px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent)', borderRadius: '1px', transition: 'width 0.2s',
              width: `${Math.round((currentWordIndex / wordSpans.length) * 100)}%`,
            }} />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>
            {currentWordIndex}/{wordSpans.length}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Q&A Tab ──────────────────────────────────────────────────────────────────

interface QaMessage {
  messageId: string
  question: string
  answer: string | null
  anchors: Array<{ type: 'timestamp'; start_seconds: number; sequence: number } | { type: 'paragraph'; paragraph_index: number }>
  createdAt: string
}

// Pending message shown optimistically while the answer loads
interface PendingMessage {
  question: string
  state: 'loading' | 'error'
  retryFn?: () => void
}

function QaTab({
  contentId,
  jumpToTimestamp,
  jumpToParagraph,
  onAnswerReceived,
}: {
  contentId: string
  jumpToTimestamp: (startSeconds: number, sequence?: number) => void
  jumpToParagraph: (paragraphIndex: number) => void
  onAnswerReceived: (anchors: SourceAnchor[]) => void
}) {
  const [messages, setMessages] = useState<QaMessage[]>([])
  const [pending, setPending] = useState<PendingMessage | null>(null)
  const [input, setInput] = useState('')
  const [charCount, setCharCount] = useState(0)
  const threadRef = useRef<HTMLDivElement>(null)

  // Restore history on mount
  useEffect(() => {
    fetch(`/api/qa/${contentId}`)
      .then((r) => r.ok ? r.json() : { messages: [] })
      .then((data) => {
        if (Array.isArray(data.messages)) setMessages(data.messages)
      })
      .catch(() => {})
  }, [contentId])

  // Auto-scroll to bottom when messages or pending changes
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages, pending])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    setCharCount(e.target.value.length)
  }

  async function submitQuestion(question: string) {
    const trimmed = question.trim()
    if (!trimmed || pending) return

    setInput('')
    setCharCount(0)

    async function doSubmit() {
      setPending({ question: trimmed, state: 'loading' })
      try {
        const res = await fetch('/api/qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentId, question: trimmed }),
        })
        if (!res.ok) {
          setPending({ question: trimmed, state: 'error', retryFn: doSubmit })
          return
        }
        const msg: QaMessage = await res.json()
        setMessages((prev) => [...prev, msg])
        setPending(null)
        if (msg.anchors.length > 0) onAnswerReceived(msg.anchors)
      } catch {
        setPending({ question: trimmed, state: 'error', retryFn: doSubmit })
      }
    }

    await doSubmit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitQuestion(input)
    }
  }

  const isInFlight = pending?.state === 'loading'
  const sendDisabled = !input.trim() || isInFlight

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
      {/* Thread */}
      <div
        ref={threadRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}
      >
        {messages.length === 0 && !pending && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '32px 16px', textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '240px' }}>
              Ask anything about this content. Every answer links back to the source.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <QaMessagePair
            key={msg.messageId}
            msg={msg}
            jumpToTimestamp={jumpToTimestamp}
            jumpToParagraph={jumpToParagraph}
          />
        ))}

        {pending && (
          <>
            {/* Question bubble */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: '12px 12px 4px 12px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: '13px', lineHeight: 1.5,
              }}>
                {pending.question}
              </div>
            </div>

            {/* Answer card: loading or error */}
            {pending.state === 'loading' && (
              <div style={{
                padding: '12px 14px', borderRadius: '12px 12px 12px 4px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span style={{ color: 'var(--accent)', fontSize: '18px', letterSpacing: '4px', animation: 'pulse 1.2s ease-in-out infinite' }}>•••</span>
                <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
              </div>
            )}
            {pending.state === 'error' && (
              <div style={{
                padding: '12px 14px', borderRadius: '12px 12px 12px 4px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Couldn't get an answer. Tap Retry.</p>
                <button
                  onClick={() => pending.retryFn?.()}
                  style={{
                    alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--accent)', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input area */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isInFlight}
            maxLength={500}
            rows={2}
            placeholder="Ask a question about this content…"
            style={{
              width: '100%', resize: 'none', padding: '10px 50px 10px 12px',
              borderRadius: '10px', border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: '13px', lineHeight: 1.5, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => submitQuestion(input)}
            disabled={sendDisabled}
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
              background: sendDisabled ? 'var(--border)' : 'linear-gradient(135deg, hsl(258,75%,55%), hsl(258,70%,45%))',
              color: 'white', fontSize: '14px', cursor: sendDisabled ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Send question"
          >
            ↑
          </button>
        </div>
        {charCount >= 480 && (
          <p style={{ fontSize: '11px', color: charCount > 490 ? 'var(--red, #ef4444)' : 'var(--muted)', marginTop: '4px', textAlign: 'right' }}>
            {charCount}/500
          </p>
        )}
      </div>
    </div>
  )
}

function QaMessagePair({
  msg,
  jumpToTimestamp,
  jumpToParagraph,
}: {
  msg: QaMessage
  jumpToTimestamp: (startSeconds: number, sequence?: number) => void
  jumpToParagraph: (paragraphIndex: number) => void
}) {
  return (
    <>
      {/* Question bubble — right aligned */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '80%', padding: '10px 14px', borderRadius: '12px 12px 4px 12px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: '13px', lineHeight: 1.5,
        }}>
          {msg.question}
        </div>
      </div>

      {/* Answer card — left aligned */}
      <div style={{
        padding: '12px 14px', borderRadius: '12px 12px 12px 4px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        {msg.answer === null ? (
          <p style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>
            I couldn't find an answer to that in this content.
          </p>
        ) : (
          <>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>{msg.answer}</p>
            {msg.anchors.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {msg.anchors.map((anchor, idx) => {
                  const label = anchor.type === 'timestamp'
                    ? formatTime(anchor.start_seconds)
                    : `¶ ${anchor.paragraph_index + 1}`
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (anchor.type === 'timestamp') {
                          jumpToTimestamp(anchor.start_seconds, anchor.sequence)
                        } else {
                          jumpToParagraph(anchor.paragraph_index)
                        }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--accent)', fontSize: '11px',
                        fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      ↗ {label}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
