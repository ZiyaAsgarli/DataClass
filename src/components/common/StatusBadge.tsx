import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const tones: Record<string, string> = {
  draft: 'border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  published: 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300',
  active: 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300',
  completed: 'border-teal-300/70 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/45 dark:text-teal-300',
  closed: 'border-stone-300/70 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
  archived: 'border-stone-300/70 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400',
  submitted: 'border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-300',
  late: 'border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/45 dark:text-orange-300',
  revision_requested: 'border-rose-300/70 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-300',
  resubmitted: 'border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-300',
  reviewed: 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300',
  upcoming: 'border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return <Badge variant="outline" className={cn(tones[status] ?? tones.draft, className)}>{label}</Badge>
}
