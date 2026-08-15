import { MoreHorizontal, UserRoundCog, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ManagedClass } from '@/types'

export function ClassCard({ course }: { course: ManagedClass }) {
  const updated = course.updatedAt ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(course.updatedAt)) : 'Recently'
  return <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"><div className="h-1 bg-primary/80" /><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><Badge className="capitalize">{course.status}</Badge>{course.teacherRole && <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{course.teacherRole}</span>}</div><h3 className="mt-3 truncate text-lg font-semibold tracking-[-0.02em]">{course.name}</h3><p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{course.description || 'No description added.'}</p></div><Button variant="ghost" size="icon" aria-label={`More options for ${course.name}`}><MoreHorizontal /></Button></div><div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-muted/45 p-4"><div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" />Students</p><p className="mt-1 text-lg font-semibold">{course.studentCount}</p></div><div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserRoundCog className="size-3.5" />Instructors</p><p className="mt-1 text-lg font-semibold">{course.instructorCount ?? 1}</p></div></div><div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Updated {updated}</p><Button size="sm" variant="outline" asChild><Link to={`/teacher/classes/${course.id}`}>Open class</Link></Button></div></div></Card>
}
