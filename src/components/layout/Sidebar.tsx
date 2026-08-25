import { ChevronLeft, GraduationCap, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Brand } from '@/components/common/Brand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NavItem, UserRole } from '@/types'

interface SidebarProps {
  role: UserRole; items: NavItem[]; collapsed: boolean; mobileOpen: boolean; onCollapse: () => void; onClose: () => void
}

export function Sidebar({ role, items, collapsed, mobileOpen, onCollapse, onClose }: SidebarProps) {
  return (
    <>
      {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-[var(--sidebar)] transition-[width,transform] duration-200 lg:z-30', collapsed && 'lg:w-[76px]', mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex h-16 items-center justify-between border-b px-5">
          <Brand compact={collapsed} />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label="Close menu"><X /></Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={`${role} navigation`}>
          {!collapsed && <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>}
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.label} to={item.href} end={item.href === `/${role}`} onClick={onClose} title={collapsed ? item.label : undefined} className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', isActive && 'bg-accent text-accent-foreground ring-1 ring-primary/15')}>
                <Icon className="size-[18px] shrink-0" />{!collapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t p-3">
          <div className={cn('flex items-center gap-3 rounded-lg bg-muted/60 p-2.5', collapsed && 'justify-center')}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card text-primary shadow-sm"><GraduationCap className="size-4" /></span>
            {!collapsed && <div className="min-w-0"><p className="truncate text-xs font-semibold">DataClass</p><p className="truncate text-[11px] text-muted-foreground">Classes and coursework</p></div>}
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={onCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="absolute -right-4 top-[86px] hidden size-8 rounded-full bg-card shadow-sm lg:inline-flex"><ChevronLeft className={cn('size-3.5 transition-transform', collapsed && 'rotate-180')} /></Button>
      </aside>
    </>
  )
}
