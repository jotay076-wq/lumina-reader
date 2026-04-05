'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'

interface AuthContext {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthCtx = createContext<AuthContext>({ session: null, user: null, loading: true })

export function useAuth() {
  return useContext(AuthCtx)
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseClient()

  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)

      // Initialize anonymous session if none exists
      if (!session) {
        supabase.auth.signInAnonymously().then(({ data }) => {
          setSession(data.session)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthCtx.Provider>
  )
}
