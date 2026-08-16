import { useCallback } from 'react'
import { ArrowLeft, BookOpen, CalendarDays, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { getStudentModule, listStudentModuleLessons } from '@/services/moduleService'

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Date not set'

export function StudentModulePage() {
  const { classId = '', moduleId = '' } = useParams()
  const loader = useCallback(async () => { const module = await getStudentModule(moduleId); if (module.classId !== classId) throw new Error('Route mismatch.'); return { module, lessons: await listStudentModuleLessons(moduleId) } }, [classId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading) return <AppShell role="student" title="Module"><LoadingState label="Loading module…" /></AppShell>
  if (error || !data) return <AppShell role="student" title="Module"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'This module does not exist or is not available to you.', 'The module could not be loaded. Please try again.')} /></AppShell>
  return <AppShell role="student" title="Module"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/student/classes/${classId}`}><ArrowLeft />Back to class</Link></Button><Card className="animate-enter p-5 sm:p-7"><Badge className="capitalize">{data.module.status}</Badge><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.module.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{data.module.description || 'No module description has been added.'}</p><div className="mt-5 flex flex-wrap gap-2">{data.module.instructorNames.map((name) => <span key={name} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs"><UserRound className="size-3.5" />{name}</span>)}</div></Card><section className="animate-enter-delay mt-8"><div className="mb-4"><h2 className="text-lg font-semibold">Published lessons</h2><p className="text-sm text-muted-foreground">Classroom sessions your teacher has made available.</p></div>{data.lessons.length ? <Card className="divide-y overflow-hidden">{data.lessons.map((lesson, index) => <Link key={lesson.id} to={`/student/classes/${classId}/modules/${moduleId}/lessons/${lesson.id}`} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-medium">{lesson.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{formatDate(lesson.lessonDate)}</p></div></div><BookOpen className="size-4 text-muted-foreground" /></Link>)}</Card> : <EmptyState title="No lessons have been published yet" description="Published classroom lessons will appear here when they are ready." />}</section></AppShell>
}
