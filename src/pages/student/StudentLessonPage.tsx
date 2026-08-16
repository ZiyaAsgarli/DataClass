import { useCallback } from 'react'
import { ArrowLeft, CalendarDays, PlaySquare } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { getStudentLesson } from '@/services/moduleService'

export function StudentLessonPage() {
  const { classId = '', moduleId = '', lessonId = '' } = useParams()
  const loader = useCallback(async () => { const lesson = await getStudentLesson(lessonId); if (lesson.classId !== classId || lesson.moduleId !== moduleId) throw new Error('Route mismatch.'); return lesson }, [classId, lessonId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading) return <AppShell role="student" title="Lesson"><LoadingState label="Loading lesson…" /></AppShell>
  if (error || !data) return <AppShell role="student" title="Lesson"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'This lesson is not published or is not available to you.', 'The lesson could not be loaded. Please try again.')} /></AppShell>
  return <AppShell role="student" title="Lesson"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/student/classes/${classId}/modules/${moduleId}`}><ArrowLeft />Back to module</Link></Button><Card className="animate-enter p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2"><Badge>Published</Badge><span className="text-xs text-muted-foreground">Lesson {String(data.position + 1).padStart(2, '0')}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.title}</h1><p className="mt-2 text-sm text-muted-foreground">{data.moduleTitle} · {data.className}</p><p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{data.lessonDate || 'Lesson date not set'}</p><div className="mt-6 border-t pt-6"><p className="max-w-3xl whitespace-pre-wrap text-sm leading-7">{data.description || 'No lesson description has been added.'}</p></div></Card><Card className="animate-enter-delay mt-6 flex min-h-56 flex-col items-center justify-center p-8 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary"><PlaySquare /></span><h2 className="mt-4 font-semibold">Lesson recording and resources will appear here</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Video playback and downloadable files are intentionally deferred to Step 6.</p></Card></AppShell>
}
