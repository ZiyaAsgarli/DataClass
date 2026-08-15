import { Bell, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import type { UserRole } from '@/types'

export function Header({ role, title, onMenu }: { role: UserRole; title: string; onMenu: () => void }) {
  const isTeacher = role === 'teacher'
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>
        <div className="min-w-0"><p className="text-[11px] font-medium capitalize text-muted-foreground">{role} workspace</p><p className="truncate text-sm font-semibold">{title}</p></div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber-500 ring-2 ring-background" /></Button>
        <div className="ml-1 flex items-center gap-2 border-l pl-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{isTeacher ? 'TA' : 'ZA'}</div>
          <div className="hidden leading-tight sm:block"><p className="text-xs font-semibold">{isTeacher ? 'Teacher Admin' : 'Ziya Asgerli'}</p><p className="text-[10px] capitalize text-muted-foreground">{role}</p></div>
        </div>
      </div>
    </header>
  )
}
