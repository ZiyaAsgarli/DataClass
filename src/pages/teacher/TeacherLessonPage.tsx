import { useCallback, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Edit3, PlaySquare, Trash2, Video } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LessonFormDialog } from '@/components/common/CourseForms'
import { LessonRecordingDialog, RemoveRecordingDialog } from '@/components/common/LessonRecording'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { youtubeThumbnailUrl, youtubeWatchUrl } from '@/lib/youtube'
import { getTeacherLesson, getTeacherLessonVideo, removeLessonVideo, setLessonYouTubeVideo, updateLesson } from '@/services/moduleService'

export function TeacherLessonPage() {
  const { classId = '', moduleId = '', lessonId = '' } = useParams()
  const loader = useCallback(async () => {
    const [lesson, video] = await Promise.all([getTeacherLesson(lessonId), getTeacherLessonVideo(lessonId)])
    if (lesson.classId !== classId || lesson.moduleId !== moduleId) throw new Error('Route mismatch.')
    return { lesson, video }
  }, [classId, lessonId, moduleId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [editing, setEditing] = useState(false)
  const [recordingDialog, setRecordingDialog] = useState(false)
  const [removeDialog, setRemoveDialog] = useState(false)

  if (loading) return <AppShell role="teacher" title="Lesson"><LoadingState label="Loading lesson…" /></AppShell>
  if (error || !data) return <AppShell role="teacher" title="Lesson"><ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'You do not have access to this lesson.', 'The lesson could not be loaded. Please try again.')} /></AppShell>

  const { lesson, video } = data
  const canManage = video.canManage === true
  const thumbnailUrl = video.videoId ? youtubeThumbnailUrl(video.videoId) : null
  const watchUrl = video.videoId ? youtubeWatchUrl(video.videoId) : null

  return <AppShell role="teacher" title="Lesson"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/teacher/classes/${classId}/modules/${moduleId}`}><ArrowLeft />Back to module</Link></Button><Card className="animate-enter p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Badge className="capitalize">{lesson.status}</Badge><span className="text-xs text-muted-foreground">Lesson {String(lesson.position + 1).padStart(2, '0')}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{lesson.title}</h1><p className="mt-2 text-sm text-muted-foreground">{lesson.moduleTitle} · {lesson.className}</p></div>{canManage && <Button variant="outline" onClick={() => setEditing(true)}><Edit3 />Edit lesson</Button>}</div><p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{lesson.lessonDate || 'Lesson date not set'}</p></Card>

  <Card className="animate-enter-delay mt-6 p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Lesson recording</p><h2 className="mt-2 text-lg font-semibold">{video.videoId ? 'Recording attached' : 'No recording added yet'}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{video.videoId ? 'This YouTube recording is available according to the lesson publication status.' : 'Upload the OBS recording to YouTube as Unlisted, then attach its link here.'}</p></div>{canManage && !video.videoId && <Button onClick={() => setRecordingDialog(true)}><Video />Add recording</Button>}</div>{video.videoId && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-center">{thumbnailUrl ? <div className="aspect-video overflow-hidden rounded-lg border bg-muted"><img className="size-full object-cover" src={thumbnailUrl} alt="YouTube recording thumbnail" loading="lazy" referrerPolicy="no-referrer" /></div> : <div className="flex aspect-video items-center justify-center rounded-lg bg-muted"><PlaySquare className="size-8 text-muted-foreground" /></div>}<div><div className="flex flex-wrap gap-2">{canManage && <Button variant="outline" onClick={() => setRecordingDialog(true)}>Replace</Button>}{canManage && <Button variant="ghost" onClick={() => setRemoveDialog(true)}><Trash2 />Remove</Button>}{watchUrl && <Button variant="ghost" asChild><a href={watchUrl} target="_blank" rel="noreferrer">Open on YouTube<ArrowUpRight /></a></Button>}</div><p className="mt-4 text-xs leading-5 text-muted-foreground">YouTube Unlisted is link-accessible and is not DRM or private video storage.</p></div></div>}</Card>

  <Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Lesson details</h2><p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7">{lesson.description || 'No lesson description has been added.'}</p></Card><Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Resources</h2><p className="mt-2 text-sm text-muted-foreground">File resources are coming in the next step.</p></Card>

  {editing && <LessonFormDialog initial={{ title: lesson.title, description: lesson.description ?? '', lessonDate: lesson.lessonDate ?? '', status: lesson.status }} onClose={() => setEditing(false)} onSave={async (title, description, date) => { await updateLesson(lesson.id, title, description, date, lesson.status); setEditing(false); await reload() }} />}
  {recordingDialog && <LessonRecordingDialog initialUrl={video.videoUrl ?? ''} onClose={() => setRecordingDialog(false)} onSave={async (url) => { await setLessonYouTubeVideo(lesson.id, url); setRecordingDialog(false); await reload() }} />}
  {removeDialog && <RemoveRecordingDialog onClose={() => setRemoveDialog(false)} onRemove={async () => { await removeLessonVideo(lesson.id); setRemoveDialog(false); await reload() }} />}
  </AppShell>
}
