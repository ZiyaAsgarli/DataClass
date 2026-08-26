import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none', variant === 'default' ? 'border-primary/15 bg-accent/70 text-accent-foreground' : 'border-[var(--strong-border)] bg-card text-muted-foreground', className)} {...props} />
}
