'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/SupabaseProvider'
import { detectUrlType, detectFileType, getAcceptedFormats } from '@/lib/detect-content-type'
import AuthModal from '@/components/AuthModal'

const TYPE_HINTS = [
  { label: 'YouTube', icon: '▶' },
  { label: 'Website', icon: '🌐' },
  { label: 'PDF', icon: '📄' },
  { label: 'Audio', icon: '🎵' },
  { label: 'eBook', icon: '📚' },
]

export default function HomePage() {
  const router = useRouter()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const isAnonymous = !user || user.is_anonymous

  async function submitUrl(url: string) {
    setError('')
    const detection = detectUrlType(url)
    if (!detection.valid) {
      setError(detection.error)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Failed to process content.')
        return
      }
      router.push(`/reader/${data.contentId}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitFile(file: File) {
    setError('')
    const detection = detectFileType(file)
    if (!detection.valid) {
      setError(detection.error)
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds the 50 MB limit.')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/ingest', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Failed to process file.')
        return
      }
      router.push(`/reader/${data.contentId}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) {
      setError(`No input provided. Accepted: ${getAcceptedFormats()}`)
      return
    }
    submitUrl(trimmed)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) submitFile(file)
  }

  return (
    <>
      <div className="min-h-dvh flex flex-col">
        {/* Top bar */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--accent)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Lumina
          </div>
          <button
            onClick={() => setShowAuth(true)}
            style={{
              fontSize: '13px',
              padding: '6px 14px',
              borderRadius: '10px',
              background: isAnonymous ? 'var(--accent-dim)' : 'var(--surface-2)',
              color: isAnonymous ? 'var(--accent)' : 'var(--text)',
              border: `1px solid ${isAnonymous ? 'rgba(124,90,246,0.3)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {isAnonymous ? 'Sign in to save history' : (user?.email ?? 'Account')}
          </button>
        </header>

        {/* Hero */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 16px 96px',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 700,
              textAlign: 'center',
              marginBottom: '12px',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
            }}
          >
            Read anything,{' '}
            <span style={{ color: 'var(--accent)' }}>understand everything</span>
          </h1>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '15px',
              maxWidth: '480px',
              lineHeight: 1.6,
              marginBottom: '40px',
            }}
          >
            Paste a YouTube link, website URL, or upload a PDF, audio file, or eBook. Lumina
            extracts and structures the content instantly.
          </p>

          {/* Input form */}
          <form
            onSubmit={handleSubmit}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ width: '100%', maxWidth: '640px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--surface)',
                border: `1.5px solid ${dragOver ? 'var(--accent)' : error ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: '16px',
                padding: '10px 14px',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: dragOver ? '0 0 0 4px var(--accent-dim)' : undefined,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setError('') }}
                placeholder="Paste a YouTube URL, website, or drag a file here…"
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'transparent',
                  outline: 'none',
                  border: 'none',
                  fontSize: '14px',
                  color: 'var(--text)',
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="Upload file"
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '7px 18px',
                  borderRadius: '10px',
                  background: loading ? 'var(--surface-2)' : 'var(--accent)',
                  color: loading ? 'var(--muted)' : '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading ? 'Processing…' : 'Process'}
              </button>
            </div>

            {error && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)', paddingLeft: '4px' }}>
                {error}
              </p>
            )}
          </form>

          {/* Type hints */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            {TYPE_HINTS.map((hint) => (
              <span
                key={hint.label}
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                {hint.icon} {hint.label}
              </span>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.mp3,.wav,.m4a,.ogg,.epub"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) submitFile(file)
              e.target.value = ''
            }}
          />
        </main>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
