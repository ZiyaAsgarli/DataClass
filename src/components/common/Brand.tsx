import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_5px_16px_rgba(47,104,70,0.2)]"><BarChart3 className="size-[19px]" /></span>
      {!compact && <span className="font-['Hanken_Grotesk'] text-lg font-bold tracking-[-0.03em] text-primary">DataClass</span>}
    </div>
  )
}
