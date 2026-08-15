import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthStateScreen } from '@/components/auth/AuthStateScreen'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

export function ProtectedRoute({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, roles, loading, error, retry } = useAuth()
  const location = useLocation()

  if (loading) return <AuthStateScreen />
  if (error) return <AuthStateScreen error={error} onRetry={() => void retry()} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!roles.includes(role)) {
    return <Navigate to={roles.includes('teacher') ? '/teacher' : '/student'} replace />
  }
  return children
}

export function RoleRedirect() {
  const { user, roles, loading, error, retry } = useAuth()

  if (loading) return <AuthStateScreen />
  if (error) return <AuthStateScreen error={error} onRetry={() => void retry()} />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roles.includes('teacher') ? '/teacher' : '/student'} replace />
}
