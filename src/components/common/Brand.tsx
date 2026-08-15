import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><BarChart3 className="size-[18px]" /></span>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em]">DataClass</span>}
    </div>
  )
}
