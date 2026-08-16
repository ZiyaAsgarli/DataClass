import { useCallback, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Edit3, Plus, UserRoundCog } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LessonFormDialog, ModuleFormDialog } from '@/components/common/CourseForms'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import {
  assignModuleInstructor, createLesson, getTeacherModule, listModuleInstructorOptions,
  listTeacherModuleLessons, removeModuleInstructor, reorderLesson, updateLesson, updateModule,
} from '@/services/moduleService'
import type { CourseLessonRecord, LessonLifecycleStatus, ModuleStatus } from '@/types'

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Date not set'

export function TeacherModulePage() {
  const { classId = '', moduleId = '' } = useParams()
  const loader = useCallback(async () => {
    const module = await getTeacherModule(moduleId)
    if (module.classId !== classId) throw new Error('Module does not belong to this class.')
    const [lessons, instructorOptions] = await Promise.all([
      listTeacherModuleLessons(moduleId),
      module.currentAccess === 'owner' ? listModuleInstructorOptions(moduleId) : Promise.resolve([]),
    ])
    return { module, lessons, instructorOptions }
  }, [classId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [editingModule, setEditingModule] = useState(false)
  const [creatingLesson, setCreatingLesson] = useState(false)
  const [editingLesson, setEditingLesson] = useState<CourseLessonRecord | null>(null)
  const [message, setMessage] = useState('')

  if (loading) return <AppShell role="teacher" title="Module"><LoadingState label="Loading module…" /></AppShell>
  if (error || !data) return <AppShell role="teacher" title="Module"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'You do not have access to this module.', 'The module could not be loaded. Please try again.')} /></AppShell>

  const { module, lessons, instructorOptions } = data
  const canManage = module.currentAccess === 'owner' || module.currentAccess === 'module_instructor'
  const owner = module.currentAccess === 'owner'
  const changeLessonStatus = async (lesson: CourseLessonRecord, status: LessonLifecycleStatus) => {
    setMessage('')
    try { await updateLesson(lesson.id, lesson.title, lesson.description ?? '', lesson.lessonDate ?? '', status); await reload(); setMessage(status === 'published' ? 'Lesson published.' : 'Lesson archived.') }
    catch { setMessage('The lesson status could not be changed.') }
  }

  return <AppShell role="teacher" title="Module management"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/teacher/classes/${classId}`}><ArrowLeft />Back to class</Link></Button><Card className="animate-enter p-5 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className="capitalize">{module.status}</Badge><span className="text-xs font-medium text-muted-foreground">{module.currentAccess === 'module_instructor' ? 'Module instructor' : module.currentAccess}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{module.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{module.description || 'No module description has been added.'}</p><p className="mt-4 text-xs text-muted-foreground">{module.instructorNames.length ? `Instructors: ${module.instructorNames.join(', ')}` : 'No module instructors assigned'}</p></div>{canManage && <div className="flex gap-2"><Button variant="outline" onClick={() => setEditingModule(true)}><Edit3 />Edit module</Button><Button onClick={() => setCreatingLesson(true)}><Plus />Add lesson</Button></div>}</div><div className="mt-7 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-muted/45 p-4"><p className="text-xs text-muted-foreground">All lessons</p><p className="mt-2 text-lg font-semibold">{module.lessonCount ?? lessons.length}</p></div><div className="rounded-lg bg-muted/45 p-4"><p className="text-xs text-muted-foreground">Published lessons</p><p className="mt-2 text-lg font-semibold">{module.publishedLessonCount}</p></div></div>{message && <p className="mt-4 text-sm text-muted-foreground" role="status">{message}</p>}</Card>

  {owner && <section className="animate-enter-delay mt-8"><div className="mb-4"><h2 className="text-lg font-semibold">Module instructors</h2><p className="text-sm text-muted-foreground">Assign teachers who already participate in this class.</p></div><Card className="divide-y overflow-hidden">{instructorOptions.map((teacher) => <div key={teacher.teacherId} className="flex items-center justify-between gap-4 p-4 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-muted"><UserRoundCog className="size-4" /></span><div><p className="text-sm font-medium">{teacher.fullName}</p><p className="text-xs capitalize text-muted-foreground">{teacher.classRole === 'owner' ? 'Owner / Lead Teacher' : 'Class instructor'}</p></div></div><Button size="sm" variant={teacher.assigned ? 'ghost' : 'outline'} onClick={async () => { if (teacher.assigned) await removeModuleInstructor(moduleId, teacher.teacherId); else await assignModuleInstructor(moduleId, teacher.teacherId); await reload() }}>{teacher.assigned ? 'Remove' : 'Assign'}</Button></div>)}{!instructorOptions.length && <p className="p-5 text-sm text-muted-foreground">Add participating teachers at class level before assigning module instructors.</p>}</Card></section>}

  <section className="mt-8"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Lessons</h2><p className="text-sm text-muted-foreground">In-person classroom sessions in teaching order.</p></div>{canManage && <Button size="sm" onClick={() => setCreatingLesson(true)}><Plus />Add lesson</Button>}</div>{lessons.length ? <Card className="divide-y overflow-hidden">{lessons.map((lesson, index) => <div key={lesson.id} className="p-4 sm:px-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link className="font-medium hover:text-primary" to={`/teacher/classes/${classId}/modules/${moduleId}/lessons/${lesson.id}`}>{lesson.title}</Link><Badge className="capitalize">{lesson.status}</Badge></div><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{formatDate(lesson.lessonDate)}</p></div></div>{canManage && <div className="flex flex-wrap gap-1"><Button size="icon" variant="ghost" disabled={index === 0} aria-label="Move lesson up" onClick={async () => { await reorderLesson(lesson.id, 'up'); await reload() }}><ArrowUp /></Button><Button size="icon" variant="ghost" disabled={index === lessons.length - 1} aria-label="Move lesson down" onClick={async () => { await reorderLesson(lesson.id, 'down'); await reload() }}><ArrowDown /></Button><Button size="sm" variant="ghost" onClick={() => setEditingLesson(lesson)}>Edit</Button>{lesson.status !== 'published' && <Button size="sm" variant="outline" onClick={() => void changeLessonStatus(lesson, 'published')}>Publish</Button>}{lesson.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => void changeLessonStatus(lesson, 'archived')}>Archive</Button>}</div>}</div></div>)}</Card> : <EmptyState title="No lessons yet" description="Create the first classroom lesson for this module." action={canManage ? <Button onClick={() => setCreatingLesson(true)}><Plus />Create lesson</Button> : undefined} />}</section>

  {editingModule && <ModuleFormDialog initial={{ title: module.title, description: module.description ?? '', status: module.status }} allowStatus={owner} onClose={() => setEditingModule(false)} onSave={async (title, description, status: ModuleStatus) => { await updateModule(moduleId, title, description, owner ? status : module.status); setEditingModule(false); await reload() }} />}
  {creatingLesson && <LessonFormDialog onClose={() => setCreatingLesson(false)} onSave={async (title, description, date) => { await createLesson(moduleId, title, description, date); setCreatingLesson(false); await reload() }} />}
  {editingLesson && <LessonFormDialog initial={{ title: editingLesson.title, description: editingLesson.description ?? '', lessonDate: editingLesson.lessonDate ?? '', status: editingLesson.status }} onClose={() => setEditingLesson(null)} onSave={async (title, description, date) => { await updateLesson(editingLesson.id, title, description, date, editingLesson.status); setEditingLesson(null); await reload() }} />}
  </AppShell>
}
