import { BookOpen, CheckCircle2, FileUp } from 'lucide-react'
import type { ActivityItem } from '@/types'

const icons = { submission: FileUp, lesson: BookOpen, review: CheckCircle2 }
export function ActivityList({ items }: { items: ActivityItem[] }) {
  return <div className="divide-y">{items.map((item) => { const Icon = icons[item.kind]; return <div key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-sm font-medium leading-5">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.time}</p></div></div> })}</div>
}
