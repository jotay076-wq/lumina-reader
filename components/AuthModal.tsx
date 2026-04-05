'use client'

import { useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
}

export default function AuthModal({ onClose }: Props) {
  const supabase = getSupabaseClient()
  const [tab, setTab] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (tab === 'signup') {
        // signUp promotes the anonymous user to a permanent user,
        // preserving user_id and all their content items.
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess('Account created! Check your email to confirm.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: 'var(--accent)', fontWeight: 600 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Lumina
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', borderRadius: '10px', padding: '4px', marginBottom: '20px' }}>
          {(['signup', 'signin'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccess('') }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {t === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          ))}
        </div>

        <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>
          {tab === 'signup' ? 'Save your history' : 'Welcome back'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', lineHeight: 1.5 }}>
          {tab === 'signup'
            ? 'Create a free account to keep your processed content across sessions.'
            : 'Sign in to access your saved content.'}
        </p>

        {tab === 'signup' && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(124,90,246,0.2)',
            borderRadius: '9px',
            padding: '10px 12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0 }}>ℹ</span>
            <span>
              <strong style={{ color: 'var(--text)' }}>Your current session is safe.</strong>{' '}
              Content you&apos;ve already processed will be linked to your new account automatically.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--muted)', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '9px',
                padding: '9px 12px',
                fontSize: '14px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--muted)', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              required
              minLength={8}
              style={{
                width: '100%',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '9px',
                padding: '9px 12px',
                fontSize: '14px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>{error}</p>}
          {success && <p style={{ fontSize: '12px', color: 'var(--green)', marginBottom: '12px' }}>{success}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '9px',
              padding: '11px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginBottom: '12px',
            }}
          >
            {loading ? '…' : tab === 'signup' ? 'Create free account' : 'Sign in'}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--muted)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '12px',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            or
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '9px',
              padding: '10px',
              fontSize: '13px',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            Continue without account
          </button>
        </form>
      </div>
    </div>
  )
}
