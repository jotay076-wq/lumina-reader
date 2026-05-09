'use client'

import { useRef } from 'react'
import type { ContentStatus, TutorCard, TutorStyle, SourceAnchor } from '@/lib/types'
import type { ConfusionEvent } from '@/lib/use-confusion-detector'

interface TutorTabProps {
  contentId: string
  contentStatus: ContentStatus
  activeConfusion: ConfusionEvent | null
  onStyleSelect: (style: TutorStyle) => void
  onDismiss: () => void
  cards: TutorCard[]
  explainStatus: 'idle' | 'loading' | 'error'
  jumpToTimestamp: (startSeconds: number, sequence: number) => void
  jumpToParagraph: (paragraphIndex: number) => void
}

const STYLE_LABELS: Record<TutorStyle, string> = {
  'analogy': 'Analogy',
  'step-by-step': 'Step-by-step',
  'plain-english': 'Plain English',
}

const STYLE_ICONS: Record<TutorStyle, string> = {
  'analogy': '🔗',
  'step-by-step': '📋',
  'plain-english': '💬',
}

const SIGNAL_LABELS: Record<ConfusionEvent['signalType'], string> = {
  'reread': 'Re-read detected',
  'slow-scroll': 'Slow scroll detected',
  'repeated-qa': 'Repeated question detected',
}

function formatAnchorLabel(anchor: SourceAnchor): string {
  if (anchor.type === 'timestamp') {
    const m = Math.floor(anchor.start_seconds / 60)
    const s = Math.floor(anchor.start_seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  return `¶ ${anchor.paragraph_index + 1}`
}

export default function TutorTab({
  contentStatus,
  activeConfusion,
  onStyleSelect,
  onDismiss,
  cards,
  explainStatus,
  jumpToTimestamp,
  jumpToParagraph,
}: TutorTabProps) {
  const lastStyleRef = useRef<TutorStyle | null>(null)

  function handleStyleSelect(style: TutorStyle) {
    lastStyleRef.current = style
    onStyleSelect(style)
  }

  function handleRetry() {
    if (lastStyleRef.current) onStyleSelect(lastStyleRef.current)
  }

  function handleJump(anchor: SourceAnchor) {
    if (anchor.type === 'timestamp') {
      jumpToTimestamp(anchor.start_seconds, anchor.sequence)
    } else {
      jumpToParagraph(anchor.paragraph_index)
    }
  }

  // Content not ready
  if (contentStatus !== 'complete') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '240px' }}>
          Content is still processing. Tutor will be available once it&apos;s ready.
        </p>
      </div>
    )
  }

  // Empty state
  if (cards.length === 0 && !activeConfusion) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '32px 16px', textAlign: 'center' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'hsla(38,90%,55%,0.08)', border: '1px solid hsla(38,90%,55%,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
        }}>
          🎓
        </div>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Your AI Tutor is watching</p>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, maxWidth: '240px' }}>
            Tutor watches as you read and offers help when a section seems tricky. No need to ask — it notices.
          </p>
        </div>
        <div style={{
          width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Tutor detects
          </p>
          {[
            { label: 'Re-reads', desc: 'scrolling back to the same passage twice' },
            { label: 'Slow scroll', desc: 'lingering on a passage for 45+ seconds' },
            { label: 'Repeated questions', desc: 'asking Q&A about the same passage more than once' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'hsl(38,90%,55%)', flexShrink: 0, marginTop: '5px' }} />
              <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'hsl(240,15%,75%)', fontWeight: 500 }}>{item.label}</strong> — {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Confusion offer banner */}
      {activeConfusion && (
        <div style={{
          background: 'hsla(38,90%,55%,0.07)', border: '1px solid hsla(38,90%,55%,0.25)',
          borderLeft: '3px solid hsl(38,90%,55%)', borderRadius: '12px', padding: '14px',
        }}>
          {explainStatus === 'loading' && (
            <SkeletonCard />
          )}

          {explainStatus === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Couldn&apos;t generate explanation. Tap Retry.</p>
              <button
                onClick={handleRetry}
                style={{
                  alignSelf: 'flex-start', padding: '6px 14px', borderRadius: '8px',
                  border: '1px solid hsla(38,90%,55%,0.4)', background: 'transparent',
                  color: 'hsl(38,90%,55%)', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {explainStatus === 'idle' && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(38,90%,55%)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
                    Tutor noticed
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                    Looks like this part might be tricky. Want a different explanation?
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                    {SIGNAL_LABELS[activeConfusion.signalType]} · &ldquo;{activeConfusion.passagePreview}&rdquo;
                  </p>
                </div>
                <button
                  onClick={onDismiss}
                  title="Dismiss"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px', flexShrink: 0, fontSize: '14px' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: '7px' }}>
                {(['analogy', 'step-by-step', 'plain-english'] as TutorStyle[]).map((style) => (
                  <button
                    key={style}
                    onClick={() => handleStyleSelect(style)}
                    style={{
                      flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: '9px', padding: '8px 6px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'hsl(38,90%,55%)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <span style={{ fontSize: '16px' }}>{STYLE_ICONS[style]}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                      {STYLE_LABELS[style]}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Re-explanation card feed */}
      {cards.map((card) => (
        <TutorCardView key={card.cardId} card={card} onJump={handleJump} />
      ))}
    </div>
  )
}

function TutorCardView({ card, onJump }: { card: TutorCard; onJump: (anchor: SourceAnchor) => void }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '12px',
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderLeft: '3px solid hsla(38,90%,55%,0.6)',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
          background: 'hsla(38,90%,55%,0.1)', color: 'hsl(38,90%,55%)',
          border: '1px solid hsla(38,90%,55%,0.25)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {STYLE_LABELS[card.style]}
        </span>
      </div>
      <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>
        {card.reexplanation}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {card.anchors.map((anchor, idx) => (
          <button
            key={idx}
            onClick={() => onJump(anchor)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'hsl(38,90%,55%)', fontSize: '11px',
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            ↗ {formatAnchorLabel(anchor)}
          </button>
        ))}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          height: '12px', borderRadius: '6px',
          width: i === 1 ? '100%' : i === 2 ? '80%' : '60%',
          background: 'linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%)',
          backgroundSize: '200% 100%',
          animation: `shimmer 1.4s ease-in-out ${(i - 1) * 0.1}s infinite`,
        }} />
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }`}</style>
    </div>
  )
}
