import { MoreHorizontal, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { CourseClass } from '@/types'

export function ClassCard({ course, featured = false }: { course: CourseClass; featured?: boolean }) {
  return <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"><div className="h-1 bg-primary/80" /><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Professional program</p><h3 className="mt-2 truncate text-lg font-semibold tracking-[-0.02em]">{course.title}</h3><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="size-3.5" />{course.students} students</p></div><Button variant="ghost" size="icon" aria-label={`More options for ${course.title}`}><MoreHorizontal /></Button></div><div className="mt-5 flex flex-wrap gap-2">{course.modules.map((module) => <Badge key={module.name} className={module.locked ? 'opacity-55' : ''}>{module.name}</Badge>)}</div><div className="mt-6"><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Overall progress</span><span className="font-semibold">{course.overallProgress}%</span></div><Progress value={course.overallProgress} /></div><div className="mt-6 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{course.updated}</p>{featured ? <Button size="sm" asChild><Link to="/teacher/classes">View class</Link></Button> : <Button size="sm" variant="outline">Open Class</Button>}</div></div></Card>
}
