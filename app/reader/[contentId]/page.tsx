'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import type { ContentType, ContentStatus, TranscriptSegment, EbookChapter } from '@/lib/types'

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
      <div style={{
        flex: 1, display: 'flex', gap: 0,
        flexDirection: 'row',
      }}>
        {/* Left panel — source content */}
        <div style={{
          width: '60%', minWidth: 0, overflowY: 'auto',
          borderRight: '1px solid var(--border)', padding: '24px',
          // On mobile: full width, stacked
        }}>
          <SourcePanel data={data} />
        </div>

        {/* Right panel — AI tools dock */}
        <div style={{ width: '40%', minWidth: 0, overflowY: 'auto', padding: '24px' }}>
          <AiDock data={data} />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .reader-split { flex-direction: column !important; }
          .reader-left { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border); }
          .reader-right { width: 100% !important; }
        }
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

function SourcePanel({ data }: { data: ContentData }) {
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
        <YouTubePanel sourceUrl={data.sourceUrl} segments={data.segments ?? []} />
      )}

      {/* Audio: HTML5 player + transcript */}
      {data.contentType === 'audio' && (
        <AudioPanel segments={data.segments ?? []} storagePath={null} />
      )}

      {/* Website / PDF / eBook: rendered text */}
      {(data.contentType === 'website' || data.contentType === 'pdf' || data.contentType === 'ebook') && (
        <TextPanel text={data.extractedText ?? ''} chapters={data.chapters} />
      )}

      {/* Hello-world confirmation: first 500 chars */}
      <div style={{
        marginTop: '24px', padding: '16px', borderRadius: '12px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Extracted text preview (first 500 chars)
        </p>
        <p style={{ fontSize: '13px', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
          {(data.extractedText ?? '').slice(0, 500)}
          {(data.extractedText ?? '').length > 500 && '…'}
        </p>
      </div>
    </div>
  )
}

function YouTubePanel({ sourceUrl, segments }: { sourceUrl: string; segments: TranscriptSegment[] }) {
  const videoId = sourceUrl.match(/(?:[?&]v=|youtu\.be\/)([^&?]+)/)?.[1] ?? ''
  return (
    <div>
      {videoId && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, marginBottom: '20px', borderRadius: '12px', overflow: 'hidden' }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            allowFullScreen
            title="YouTube video"
          />
        </div>
      )}
      <TranscriptList segments={segments} />
    </div>
  )
}

function AudioPanel({ segments }: { segments: TranscriptSegment[]; storagePath: string | null }) {
  return (
    <div>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ color: 'var(--muted)', fontSize: '20px' }}>🎵</span>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Audio player available after storage URL is configured.</p>
      </div>
      <TranscriptList segments={segments} />
    </div>
  )
}

function TranscriptList({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) return <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No transcript segments available.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        Transcript
      </h3>
      {segments.map((s) => (
        <div key={s.sequence} style={{ display: 'flex', gap: '10px', fontSize: '13px', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, minWidth: '44px', fontSize: '11px', paddingTop: '2px' }}>
            {formatTime(s.start)}
          </span>
          <span>{s.text}</span>
        </div>
      ))}
    </div>
  )
}

function TextPanel({ text, chapters }: { text: string; chapters: EbookChapter[] | null }) {
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
  return <p style={{ fontSize: '14px', lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{text}</p>
}

function AiDock({ data }: { data: ContentData }) {
  const [activeTab, setActiveTab] = useState<'summary' | 'qa' | 'read-aloud'>('summary')
  const tabs = [
    { id: 'summary' as const, label: 'Summary' },
    { id: 'qa' as const, label: 'Q&A' },
    { id: 'read-aloud' as const, label: 'Read Aloud' },
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

      {/* Placeholder content */}
      <div style={{
        border: '1px dashed var(--border)', borderRadius: '12px', padding: '32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '10px', textAlign: 'center',
      }}>
        <span style={{ fontSize: '24px' }}>
          {activeTab === 'summary' ? '📝' : activeTab === 'qa' ? '💬' : '🔊'}
        </span>
        <p style={{ fontSize: '14px', fontWeight: 500 }}>
          {activeTab === 'summary' ? 'AI Summary' : activeTab === 'qa' ? 'Ask a Question' : 'Read Aloud'}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
          {activeTab === 'summary'
            ? 'AI-powered summarization coming in REQ-2.'
            : activeTab === 'qa'
            ? 'Source-anchored Q&A coming in REQ-3.'
            : 'Text-to-speech narration coming in REQ-4.'}
        </p>
        <div style={{
          marginTop: '8px', padding: '8px 14px', borderRadius: '9px',
          background: 'var(--surface-2)', fontSize: '11px', color: 'var(--muted)',
        }}>
          Content: {data.contentType} · {(data.extractedText ?? '').length.toLocaleString()} chars extracted
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
