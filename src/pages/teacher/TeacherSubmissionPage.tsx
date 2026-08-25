import { useCallback, useState } from 'react'
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { SubmissionFileList } from '@/components/common/AssignmentFiles'
import { ReviewDialog } from '@/components/common/AssignmentForms'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { formatDateTime, submissionLabel } from '@/lib/assignments'
import { getSubmissionDetail, listSubmissionFiles, reviewSubmission } from '@/services/assignmentService'

export function TeacherSubmissionPage() {
  const { assignmentId = '', submissionId = '' } = useParams()
  const loader = useCallback(async () => ({ detail: await getSubmissionDetail(submissionId), files: await listSubmissionFiles(submissionId) }), [submissionId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [action, setAction] = useState<'reviewed' | 'revision_requested' | null>(null)
  if (loading) return <AppShell role="teacher" title="Submission"><LoadingState label="Loading submission…" /></AppShell>
  if (error || !data) return <AppShell role="teacher" title="Submission"><ErrorState retry={() => void reload()} /></AppShell>
  const { detail, files } = data
  const reviewable = ['submitted', 'late', 'resubmitted'].includes(detail.status)
  return <AppShell role="teacher" title="Submission"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to={`/teacher/assignments/${assignmentId}`}><ArrowLeft />Back to assignment</Link></Button><Card className="p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex gap-2"><Badge>{submissionLabel(detail.status)}</Badge>{detail.wasLate && <Badge variant="outline">Late</Badge>}</div><h1 className="mt-4 text-2xl font-semibold">{detail.studentName}</h1><p className="mt-1 text-sm text-muted-foreground">{detail.studentEmail}</p><p className="mt-4 text-sm text-muted-foreground">Submitted {formatDateTime(detail.submittedAt)}</p></div>{reviewable && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setAction('revision_requested')}><RotateCcw />Request revision</Button><Button onClick={() => setAction('reviewed')}><CheckCircle2 />Mark reviewed</Button></div>}</div></Card><Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Submission versions</h2><p className="mt-1 text-sm text-muted-foreground">Earlier files are preserved when a student resubmits.</p><div className="mt-5"><SubmissionFileList files={files} /></div></Card><Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Teacher feedback</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{detail.feedbackMessage || 'No feedback has been added.'}</p></Card>{action && <ReviewDialog action={action} initial={detail.feedbackMessage ?? ''} onClose={() => setAction(null)} onSave={async (message) => { await reviewSubmission(detail.id, action, message); setAction(null); await reload() }} />}</AppShell>
}
