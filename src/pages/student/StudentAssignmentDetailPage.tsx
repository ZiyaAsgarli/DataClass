import { useCallback } from 'react'
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, RotateCcw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StudentAssignmentResources, StudentSubmissionUpload, SubmissionFileList } from '@/components/common/AssignmentFiles'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { formatDateTime, submissionLabel } from '@/lib/assignments'
import { getStudentAssignment, listSubmissionFiles } from '@/services/assignmentService'

export function StudentAssignmentDetailPage() {
  const { assignmentId = '' } = useParams()
  const loader = useCallback(async () => {
    const assignment = await getStudentAssignment(assignmentId)
    const files = assignment.submissionId ? await listSubmissionFiles(assignment.submissionId) : []
    return { assignment, files }
  }, [assignmentId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading) return <AppShell role="student" title="Assignment"><LoadingState label="Loading assignment…" /></AppShell>
  if (error || !data) return <AppShell role="student" title="Assignment"><ErrorState retry={() => void reload()} /></AppShell>
  const { assignment, files } = data
  const status = assignment.submissionStatus
  const canUpload = !status || status === 'draft' || status === 'revision_requested'
  return <AppShell role="student" title="Assignment"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to="/student/assignments"><ArrowLeft />Back to assignments</Link></Button><Card className="p-5 sm:p-7"><Badge>{submissionLabel(status)}</Badge><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{assignment.title}</h1><p className="mt-2 text-sm text-muted-foreground">{assignment.className}{assignment.lessonTitle ? ` · ${assignment.lessonTitle}` : ''}</p><p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{formatDateTime(assignment.dueAt)} · {assignment.allowLateSubmission ? 'Late submissions allowed' : 'Late submissions close at the deadline'}</p></Card><Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Instructions</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{assignment.description || 'No additional instructions were provided.'}</p></Card><div className="mt-6"><StudentAssignmentResources assignmentId={assignment.id} /></div><Card className="mt-6 p-5 sm:p-7"><div className="flex items-center gap-2">{status === 'reviewed' ? <CheckCircle2 className="size-5 text-primary" /> : status === 'revision_requested' ? <RotateCcw className="size-5 text-amber-600" /> : <Clock3 className="size-5 text-muted-foreground" />}<h2 className="font-semibold">Your submission</h2></div>{assignment.feedbackMessage && <div className="mt-5 rounded-lg border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Teacher feedback</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{assignment.feedbackMessage}</p></div>}{files.length > 0 && <div className="mt-5"><SubmissionFileList files={files} /></div>}{canUpload ? <div className="mt-5"><StudentSubmissionUpload assignmentId={assignment.id} revision={status === 'revision_requested'} onSubmitted={async () => { await reload() }} /></div> : <p className="mt-5 text-sm text-muted-foreground">{status === 'reviewed' ? `Reviewed ${formatDateTime(assignment.reviewedAt)}` : `Submitted ${formatDateTime(assignment.submittedAt)}`}</p>}</Card></AppShell>
}
