import { useState, type ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { studentNav, teacherNav } from '@/data/mockData'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

export function AppShell({ role, title, children }: { role: UserRole; title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const items = role === 'teacher' ? teacherNav : studentNav
  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={role} items={items} collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => setCollapsed((value) => !value)} onClose={() => setMobileOpen(false)} />
      <div className={cn('min-w-0 transition-[padding] duration-200 lg:pl-64', collapsed && 'lg:pl-[76px]')}>
        <Header role={role} title={title} onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">{children}</main>
      </div>
    </div>
  )
}
