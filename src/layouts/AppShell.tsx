import { useState, type ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { WorkspaceHelp } from '@/components/common/WorkspaceHelp'
import { studentNav, teacherNav } from '@/data/navigation'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

export function AppShell({ role, title, children }: { role: UserRole; title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const items = role === 'teacher' ? teacherNav : studentNav
  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={role} items={items} collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => setCollapsed((value) => !value)} onClose={() => setMobileOpen(false)} onHelp={() => setHelpOpen(true)} />
      <div className={cn('min-w-0 transition-[padding] duration-200 lg:pl-[272px]', collapsed && 'lg:pl-20')}>
        <Header role={role} title={title} onMenu={() => setMobileOpen(true)} onHelp={() => setHelpOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-12">{children}</main>
      </div>
      {helpOpen && <WorkspaceHelp role={role} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
