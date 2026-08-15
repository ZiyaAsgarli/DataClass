import { ArrowUpRight } from 'lucide-react'
import { teacherStats } from '@/data/mockData'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const tones = { green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' }

export function StatGrid() {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{teacherStats.map((stat) => { const Icon = stat.icon; return <Card key={stat.label} className="group p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{stat.value}</p></div><span className={cn('flex size-9 items-center justify-center rounded-lg', tones[stat.tone])}><Icon className="size-[17px]" /></span></div><p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpRight className="size-3" />{stat.change}</p></Card> })}</div>
}
