import { useState } from 'react'
import { Bell, LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'DC'
}

export function Header({ role, title, onMenu }: { role: UserRole; title: string; onMenu: () => void }) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signOutError, setSignOutError] = useState(false)
  const displayName = profile?.fullName || user?.name || 'DataClass user'
  const avatarUrl = profile?.avatarUrl || user?.image

  const handleSignOut = async () => {
    setSignOutError(false)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setSignOutError(true)
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>
        <div className="min-w-0"><p className="text-[11px] font-medium capitalize text-muted-foreground">{role} workspace</p><p className="truncate text-sm font-semibold">{title}</p></div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber-500 ring-2 ring-background" /></Button>
        <div className="ml-1 flex min-w-0 items-center gap-2 border-l pl-3">
          {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full object-cover" /> : <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(displayName)}</div>}
          <div className="hidden min-w-0 leading-tight sm:block"><p className="max-w-36 truncate text-xs font-semibold">{displayName}</p><p className="text-[10px] capitalize text-muted-foreground">{role}</p></div>
          <Button variant="ghost" size="icon" onClick={() => void handleSignOut()} aria-label="Sign out" title={signOutError ? 'Sign out failed. Try again.' : 'Sign out'} className={signOutError ? 'text-destructive' : ''}><LogOut /></Button>
        </div>
      </div>
    </header>
  )
}
