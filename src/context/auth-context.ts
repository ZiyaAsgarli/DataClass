import { createContext } from 'react'
import type { BetterAuthSession, BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import type { AuthProfile, UserRole } from '@/types'

export interface AuthContextValue {
  session: BetterAuthSession | null
  user: BetterAuthUser | null
  profile: AuthProfile | null
  roles: UserRole[]
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  retry: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
