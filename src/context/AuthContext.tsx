import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BetterAuthSession, BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import {
  AuthContext,
  type AuthContextValue,
  type AuthInitializationIssue,
  type AuthInitializationIssueCode,
  type AuthInitializationPhase,
  type AuthInitializationPrivilegeCategory,
} from '@/context/auth-context'
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

const issueCodeByPhase: Record<AuthInitializationPhase, AuthInitializationIssueCode> = {
  session: 'AUTH_INIT_SESSION_FAILED',
  'profile-bootstrap': 'AUTH_INIT_PROFILE_BOOTSTRAP_FAILED',
  'role-validation': 'AUTH_INIT_ROLE_VALIDATION_FAILED',
  'invitation-claim': 'AUTH_INIT_INVITATION_CLAIM_FAILED',
}

function safeNumericStatus(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null
}

function safeDatabaseCode(value: unknown) {
  return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : null
}

function classifyInsufficientPrivilege(
  databaseCode: string | null,
  error: unknown,
): AuthInitializationPrivilegeCategory | null {
  if (databaseCode !== '42501') return null

  const source = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const message = typeof source?.message === 'string' ? source.message.toLowerCase() : ''

  if (message.includes('permission denied for function')) return 'PERMISSION_FUNCTION'
  if (message.includes('authenticated user identity is unavailable')) return 'AUTH_IDENTITY_UNAVAILABLE'
  if (message.includes('authentication is required')) return 'AUTHENTICATION_REQUIRED'
  return 'INSUFFICIENT_PRIVILEGE_UNKNOWN'
}

interface InitializationDiagnosticContext {
  attemptId: string
  tokenPresent: boolean
}

function createInitializationIssue(
  phase: AuthInitializationPhase,
  error: unknown,
  diagnosticContext: InitializationDiagnosticContext,
  categoryOverride?: AuthInitializationIssue['category'],
): AuthInitializationIssue {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const httpStatus = safeNumericStatus(source?.status) ?? safeNumericStatus(source?.statusCode)
  const databaseCode = safeDatabaseCode(source?.code)
  const category = categoryOverride
    ?? (httpStatus === 401 ? 'authentication'
      : httpStatus === 403 || databaseCode === '42501' ? 'authorization'
        : httpStatus !== null ? 'transport'
          : databaseCode !== null ? 'database'
            : error instanceof TypeError ? 'transport'
              : 'unknown')

  return {
    attemptId: diagnosticContext.attemptId,
    phase,
    code: issueCodeByPhase[phase],
    category,
    httpStatus,
    databaseCode,
    privilegeCategory: classifyInsufficientPrivilege(databaseCode, error),
    tokenPresent: diagnosticContext.tokenPresent,
    occurredAt: new Date().toISOString(),
  }
}

function reportInitializationIssue(issue: AuthInitializationIssue) {
  if (!import.meta.env.DEV) return
  console.warn(`[auth-init] ${JSON.stringify(issue)}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BetterAuthSession | null>(null)
  const [user, setUser] = useState<BetterAuthUser | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initializationIssue, setInitializationIssue] = useState<AuthInitializationIssue | null>(null)
  const initializationRef = useRef<Promise<void> | null>(null)
  const initializationAttemptRef = useRef(0)

  const clearAuth = useCallback(() => {
    setSession(null)
    setUser(null)
    setProfile(null)
    setRoles([])
    setInitializationIssue(null)
  }, [])

  const performAuthResolution = useCallback(async () => {
    const diagnosticContext: InitializationDiagnosticContext = {
      attemptId: `auth-init-${Date.now().toString(36)}-${++initializationAttemptRef.current}`,
      tokenPresent: false,
    }

    setLoading(true)
    setError(null)
    setInitializationIssue(null)

    try {
      let sessionResult: Awaited<ReturnType<typeof neonClient.auth.getSession>>

      try {
        sessionResult = await neonClient.auth.getSession()
        if (sessionResult.error) throw sessionResult.error
      } catch (caughtError) {
        const issue = createInitializationIssue('session', caughtError, diagnosticContext)
        reportInitializationIssue(issue)
        clearAuth()
        setInitializationIssue(issue)
        setError(safeMessage(caughtError, 'We could not confirm your authenticated session.'))
        return
      }

      if (!sessionResult.data?.session || !sessionResult.data.user) {
        clearAuth()
        return
      }

      if (!sessionResult.data.session.token) {
        const issue = createInitializationIssue('session', null, diagnosticContext, 'authentication')
        reportInitializationIssue(issue)
        clearAuth()
        setInitializationIssue(issue)
        setError('We could not confirm your authenticated session.')
        return
      }

      const resolvedSession = sessionResult.data.session
      const resolvedUser = sessionResult.data.user
      diagnosticContext.tokenPresent = true

      setSession(resolvedSession)
      setUser(resolvedUser)
      setProfile(null)
      setRoles([])

      let row: BootstrapRow | undefined

      try {
        const bootstrapResult = await neonClient.rpc('bootstrap_current_user')
        if (bootstrapResult.error) throw bootstrapResult.error
        row = (bootstrapResult.data as BootstrapRow[] | null)?.[0]
        if (!row) throw new Error('Profile bootstrap returned no profile.')
      } catch (caughtError) {
        const issue = createInitializationIssue('profile-bootstrap', caughtError, diagnosticContext)
        reportInitializationIssue(issue)
        setInitializationIssue(issue)
        setError(safeMessage(caughtError, 'We could not finish setting up your DataClass workspace.'))
        return
      }

      const resolvedRoles = Array.isArray(row.roles) ? row.roles.filter(isUserRole) : []
      if (resolvedRoles.length === 0) {
        const issue = createInitializationIssue('role-validation', null, diagnosticContext, 'validation')
        reportInitializationIssue(issue)
        setInitializationIssue(issue)
        setError('We could not finish setting up your DataClass workspace.')
        return
      }

      setProfile({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      })
      setRoles(resolvedRoles)

      try {
        const claimResult = await neonClient.rpc('claim_my_class_invitations')
        if (claimResult.error) throw claimResult.error
      } catch (caughtError) {
        const issue = createInitializationIssue('invitation-claim', caughtError, diagnosticContext)
        reportInitializationIssue(issue)
        setInitializationIssue(issue)
      }
    } finally {
      setLoading(false)
    }
  }, [clearAuth])

  const resolveAuth = useCallback(() => {
    if (initializationRef.current) {
      return initializationRef.current
    }

    const initialization = performAuthResolution().finally(() => {
      if (initializationRef.current === initialization) {
        initializationRef.current = null
      }
    })

    initializationRef.current = initialization
    return initialization
  }, [performAuthResolution])

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
    initializationIssue,
    signInWithGoogle,
    signOut,
    retry: resolveAuth,
  }), [error, initializationIssue, loading, profile, resolveAuth, roles, session, signInWithGoogle, signOut, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
