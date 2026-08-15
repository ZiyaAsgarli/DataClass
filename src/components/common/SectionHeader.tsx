import type { ReactNode } from 'react'

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      {action}
    </div>
  )
}
