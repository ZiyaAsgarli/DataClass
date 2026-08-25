import { useCallback } from 'react'
import { CalendarDays, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { formatDateTime, studentAssignmentLabel } from '@/lib/assignments'
import { listStudentAssignments } from '@/services/assignmentService'

export function StudentAssignmentsPage() {
  const loader = useCallback(() => listStudentAssignments(), [])
  const { data, loading, error, reload } = useAsyncData(loader)
  return <AppShell role="student" title="Assignments"><div><p className="text-sm font-medium text-primary">Coursework</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Assignments</h1><p className="mt-2 text-sm text-muted-foreground">Download task files, submit your work, and follow revision feedback.</p></div><div className="mt-8">{loading ? <LoadingState label="Loading assignments…" /> : error || !data ? <ErrorState retry={() => void reload()} /> : !data.length ? <EmptyState title="No assignments yet" description="Published assignments from your classes will appear here." /> : <div className="grid gap-4 xl:grid-cols-2">{data.map((assignment) => <Card key={assignment.id} className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><Badge variant={assignment.submissionStatus === 'revision_requested' ? 'outline' : 'default'}>{studentAssignmentLabel(assignment)}</Badge><h2 className="mt-3 truncate text-lg font-semibold">{assignment.title}</h2><p className="mt-1 text-sm text-muted-foreground">{assignment.className}{assignment.lessonTitle ? ` · ${assignment.lessonTitle}` : ''}</p></div><ClipboardList className="size-5 shrink-0 text-muted-foreground" /></div><p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{formatDateTime(assignment.dueAt)}</p><div className="mt-5 border-t pt-4 text-right"><Button size="sm" variant="outline" asChild><Link to={`/student/assignments/${assignment.id}`}>Open assignment</Link></Button></div></Card>)}</div>}</div></AppShell>
}
