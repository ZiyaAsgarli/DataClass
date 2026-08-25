import { Check, Circle, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ModuleLifecycleStatus } from '@/types'

const lifecycle = {
  upcoming: { label: 'Upcoming', Icon: Circle },
  active: { label: 'Active', Icon: Play },
  completed: { label: 'Completed', Icon: Check },
} satisfies Record<ModuleLifecycleStatus, { label: string; Icon: typeof Circle }>

export function ModuleLifecycleBadge({ status, currentLabel = false }: { status: ModuleLifecycleStatus; currentLabel?: boolean }) {
  const { label, Icon } = lifecycle[status]
  return (
    <Badge
      variant={status === 'upcoming' ? 'outline' : 'default'}
      className={cn(
        'gap-1.5 whitespace-nowrap',
        status === 'active' && 'border-primary bg-primary text-primary-foreground',
        status === 'completed' && 'border-primary/20 bg-primary/10 text-primary',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {status === 'active' && currentLabel ? 'Current module' : label}
    </Badge>
  )
}

export function ModuleLifecycleControl({ status, disabled, canActivate = true, onChange }: { status: ModuleLifecycleStatus; disabled?: boolean; canActivate?: boolean; onChange: (status: ModuleLifecycleStatus) => void }) {
  return (
    <label className="block">
      <span className="sr-only">Teaching status</span>
      <select
        value={status}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ModuleLifecycleStatus)}
        className="h-8 max-w-36 rounded-md border bg-background px-2 text-xs font-medium shadow-sm outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Change teaching status"
      >
        <option value="upcoming">Upcoming</option>
        <option value="active" disabled={!canActivate}>Active</option>
        <option value="completed">Completed</option>
      </select>
    </label>
  )
}
