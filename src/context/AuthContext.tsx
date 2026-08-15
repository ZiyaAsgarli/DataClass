import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BetterAuthSession, BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import { AuthContext, type AuthContextValue } from '@/context/auth-context'
import { neonClient } from '@/lib/neon'
import type { AuthProfile, UserRole } from '@/types'

interface BootstrapRow {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  roles: string[]
}

function isUserRole(value: string): value is UserRole {
  return value === 'teacher' || value === 'student'
}

function safeMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.includes('Missing browser-safe')) {
    return 'Authentication is not configured for this environment.'
  }
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BetterAuthSession | null>(null)
  const [user, setUser] = useState<BetterAuthUser | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clearAuth = useCallback(() => {
    setSession(null)
    setUser(null)
    setProfile(null)
    setRoles([])
  }, [])

  const resolveAuth = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const sessionResult = await neonClient.auth.getSession()

      if (sessionResult.error) {
        throw sessionResult.error
      }

      if (!sessionResult.data?.session || !sessionResult.data.user) {
        clearAuth()
        return
      }

      const bootstrapResult = await neonClient.rpc('bootstrap_current_user')
      if (bootstrapResult.error) {
        throw bootstrapResult.error
      }

      const row = (bootstrapResult.data as BootstrapRow[] | null)?.[0]
      if (!row) {
        throw new Error('Profile bootstrap returned no profile.')
      }

      const resolvedRoles = row.roles.filter(isUserRole)
      if (resolvedRoles.length === 0) {
        throw new Error('No application role is assigned.')
      }

      setSession(sessionResult.data.session)
      setUser(sessionResult.data.user)
      setProfile({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      })
      setRoles(resolvedRoles)
    } catch (caughtError) {
      clearAuth()
      setError(safeMessage(caughtError, 'We could not finish setting up your DataClass workspace.'))
    } finally {
      setLoading(false)
    }
  }, [clearAuth])

  useEffect(() => {
    void resolveAuth()
  }, [resolveAuth])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    const callbackURL = `${window.location.origin}/auth/callback`
    const result = await neonClient.auth.signIn.social({
      provider: 'google',
      callbackURL,
      newUserCallbackURL: callbackURL,
    })

    if (result.error) {
      setError('Google sign-in could not be started. Please try again.')
      throw result.error
    }
  }, [])

  const signOut = useCallback(async () => {
    const result = await neonClient.auth.signOut()
    if (result.error) {
      setError('Sign out failed. Please try again.')
      throw result.error
    }
    clearAuth()
  }, [clearAuth])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    profile,
    roles,
    loading,
    error,
    signInWithGoogle,
    signOut,
    retry: resolveAuth,
  }), [error, loading, profile, resolveAuth, roles, session, signInWithGoogle, signOut, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
