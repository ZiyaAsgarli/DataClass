import { createContext } from 'react'
import type { BetterAuthSession, BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import type { AuthProfile, UserRole } from '@/types'

export type AuthInitializationPhase = 'session' | 'profile-bootstrap' | 'role-validation' | 'invitation-claim'

export type AuthInitializationIssueCode =
  | 'AUTH_INIT_SESSION_FAILED'
  | 'AUTH_INIT_PROFILE_BOOTSTRAP_FAILED'
  | 'AUTH_INIT_ROLE_VALIDATION_FAILED'
  | 'AUTH_INIT_INVITATION_CLAIM_FAILED'

export type AuthInitializationPrivilegeCategory =
  | 'PERMISSION_FUNCTION'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTH_IDENTITY_UNAVAILABLE'
  | 'INSUFFICIENT_PRIVILEGE_UNKNOWN'

export interface AuthInitializationIssue {
  attemptId: string
  phase: AuthInitializationPhase
  code: AuthInitializationIssueCode
  category: 'authentication' | 'transport' | 'authorization' | 'database' | 'validation' | 'unknown'
  httpStatus: number | null
  databaseCode: string | null
  privilegeCategory: AuthInitializationPrivilegeCategory | null
  tokenPresent: boolean
  occurredAt: string
}

export interface AuthContextValue {
  session: BetterAuthSession | null
  user: BetterAuthUser | null
  profile: AuthProfile | null
  roles: UserRole[]
  loading: boolean
  error: string | null
  initializationIssue: AuthInitializationIssue | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  retry: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
