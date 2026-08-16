import { useCallback, useState } from 'react'
import { ArrowLeft, CalendarDays, Edit3 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LessonFormDialog } from '@/components/common/CourseForms'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { getTeacherLesson, updateLesson } from '@/services/moduleService'

export function TeacherLessonPage() {
  const { classId = '', moduleId = '', lessonId = '' } = useParams()
  const loader = useCallback(async () => { const lesson = await getTeacherLesson(lessonId); if (lesson.classId !== classId || lesson.moduleId !== moduleId) throw new Error('Route mismatch.'); return lesson }, [classId, lessonId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [editing, setEditing] = useState(false)
  if (loading) return <AppShell role="teacher" title="Lesson"><LoadingState label="Loading lesson…" /></AppShell>
  if (error || !data) return <AppShell role="teacher" title="Lesson"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'You do not have access to this lesson.', 'The lesson could not be loaded. Please try again.')} /></AppShell>
  const canManage = data.currentAccess === 'owner' || data.currentAccess === 'module_instructor'
  return <AppShell role="teacher" title="Lesson"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/teacher/classes/${classId}/modules/${moduleId}`}><ArrowLeft />Back to module</Link></Button><Card className="animate-enter p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Badge className="capitalize">{data.status}</Badge><span className="text-xs text-muted-foreground">Lesson {String(data.position + 1).padStart(2, '0')}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.title}</h1><p className="mt-2 text-sm text-muted-foreground">{data.moduleTitle} · {data.className}</p></div>{canManage && <Button variant="outline" onClick={() => setEditing(true)}><Edit3 />Edit lesson</Button>}</div><p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{data.lessonDate || 'Lesson date not set'}</p><div className="mt-6 border-t pt-6"><p className="max-w-3xl whitespace-pre-wrap text-sm leading-7">{data.description || 'No lesson description has been added.'}</p></div></Card><Card className="animate-enter-delay mt-6 flex min-h-52 flex-col items-center justify-center p-8 text-center"><h2 className="font-semibold">Recording and resources are not enabled yet</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Video and lesson files will be introduced in Step 6.</p></Card>{editing && <LessonFormDialog initial={{ title: data.title, description: data.description ?? '', lessonDate: data.lessonDate ?? '', status: data.status }} onClose={() => setEditing(false)} onSave={async (title, description, date) => { await updateLesson(data.id, title, description, date, data.status); setEditing(false); await reload() }} />}</AppShell>
}
