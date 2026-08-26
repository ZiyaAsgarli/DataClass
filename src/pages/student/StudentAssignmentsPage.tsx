import { useCallback } from 'react'
import { CalendarDays, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { formatDateTime, studentAssignmentLabel } from '@/lib/assignments'
import { listStudentAssignments } from '@/services/assignmentService'

export function StudentAssignmentsPage() {
  const loader = useCallback(() => listStudentAssignments(), [])
  const { data, loading, error, reload } = useAsyncData(loader)
  return (
    <AppShell role="student" title="Assignments">
      <div>
        <p className="page-kicker">Coursework</p>
        <h1 className="page-title">
          Assignments
        </h1>
        <p className="page-description">
          Download task files, submit your work, and follow revision feedback.
        </p>
      </div>
      <div className="mt-8">
        {loading ? (
          <LoadingState label="Loading assignments…" />
        ) : error || !data ? (
          <ErrorState retry={() => void reload()} />
        ) : !data.length ? (
          <EmptyState
            title="No assignments yet"
            description="Your teacher has not published any coursework yet. Nothing is required from you right now."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.map((assignment) => (
              <Card key={assignment.id} className={assignment.submissionStatus === 'revision_requested' ? 'border-rose-300/60 bg-rose-50/55 p-5 dark:border-rose-900 dark:bg-rose-950/20 sm:p-6' : 'border-[var(--strong-border)] p-5 sm:p-6'}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <StatusBadge status={assignment.submissionStatus ?? 'upcoming'} label={studentAssignmentLabel(assignment)} />
                    <h2 className="mt-3 truncate text-lg font-semibold">
                      {assignment.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {assignment.className}
                      {assignment.lessonTitle
                        ? ` · ${assignment.lessonTitle}`
                        : ''}
                    </p>
                  </div>
                  <span className="icon-tile shrink-0"><ClipboardList className="size-5" /></span>
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" />
                  {formatDateTime(assignment.dueAt)}
                </p>
                {assignment.submissionStatus === 'revision_requested' && <p className="mt-4 text-sm font-medium text-rose-800 dark:text-rose-300">Your teacher left feedback. Open this assignment to upload a corrected version.</p>}
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <span className="text-xs text-muted-foreground">{assignment.lessonTitle || 'Class assignment'}</span>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/student/assignments/${assignment.id}`}>
                      Open assignment
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
