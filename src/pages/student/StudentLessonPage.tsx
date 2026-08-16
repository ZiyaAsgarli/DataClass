import { useCallback } from 'react'
import { ArrowLeft, CalendarDays, PlaySquare } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { YouTubePlayer } from '@/components/common/LessonRecording'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { getStudentLesson, getStudentLessonVideo } from '@/services/moduleService'

export function StudentLessonPage() {
  const { classId = '', moduleId = '', lessonId = '' } = useParams()
  const loader = useCallback(async () => {
    const [lesson, video] = await Promise.all([getStudentLesson(lessonId), getStudentLessonVideo(lessonId)])
    if (lesson.classId !== classId || lesson.moduleId !== moduleId) throw new Error('Route mismatch.')
    return { lesson, video }
  }, [classId, lessonId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading) return <AppShell role="student" title="Lesson"><LoadingState label="Loading lesson…" /></AppShell>
  if (error || !data) return <AppShell role="student" title="Lesson"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'This lesson is not published or is not available to you.', 'The lesson could not be loaded. Please try again.')} /></AppShell>

  const { lesson, video } = data
  return <AppShell role="student" title="Lesson"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/student/classes/${classId}/modules/${moduleId}`}><ArrowLeft />Back to module</Link></Button><Card className="animate-enter p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2"><Badge>Published</Badge><span className="text-xs text-muted-foreground">Lesson {String(lesson.position + 1).padStart(2, '0')}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{lesson.title}</h1><p className="mt-2 text-sm text-muted-foreground">{lesson.moduleTitle} · {lesson.className}</p><p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{lesson.lessonDate || 'Lesson date not set'}</p></Card>

  <Card className="animate-enter-delay mt-6 p-4 sm:p-6"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recording</p><h2 className="mt-2 text-lg font-semibold">Classroom lesson recording</h2></div>{video.provider === 'youtube' && video.videoId ? <YouTubePlayer videoId={video.videoId} title={lesson.title} /> : <div className="flex min-h-52 flex-col items-center justify-center rounded-lg bg-muted/50 p-8 text-center"><PlaySquare className="size-8 text-muted-foreground" /><p className="mt-4 font-medium">Recording not available yet.</p><p className="mt-1 text-sm text-muted-foreground">Your teacher can attach the classroom recording when it is ready.</p></div>}</Card>

  <Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Description and notes</h2><p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7">{lesson.description || 'No lesson description has been added.'}</p></Card><Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Resources</h2><p className="mt-2 text-sm text-muted-foreground">Lesson files will appear here.</p></Card></AppShell>
}
