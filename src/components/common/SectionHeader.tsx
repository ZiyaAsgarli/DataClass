import type { ReactNode } from 'react'

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div><h2 className="text-xl font-semibold tracking-[-0.025em] sm:text-[22px]">{title}</h2>{description && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>}</div>
      {action}
    </div>
  )
}
