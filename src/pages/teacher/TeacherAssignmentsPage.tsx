import { useCallback, useState } from 'react'
import { CalendarDays, ClipboardList, Plus, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AssignmentFormDialog } from '@/components/common/AssignmentForms'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { assignmentStatusLabel, formatDateTime } from '@/lib/assignments'
import { createAssignment, listTeacherAssignments } from '@/services/assignmentService'
import { listTeacherClasses } from '@/services/classService'

export function TeacherAssignmentsPage() {
  const navigate = useNavigate()
  const loader = useCallback(
    async () => ({
      assignments: await listTeacherAssignments(),
      classes: await listTeacherClasses(),
    }),
    [],
  )
  const { data, loading, error, reload } = useAsyncData(loader)
  const [creating, setCreating] = useState(false)
  return (
    <AppShell role="teacher" title="Assignments">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Coursework</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Assignments</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create coursework, share task files, and review student submissions.</p>
        </div>
        <Button disabled={!data?.classes.length} onClick={() => setCreating(true)}>
          <Plus />
          Create assignment
        </Button>
      </div>
      <div className="mt-8">
        {loading ? (
          <LoadingState label="Loading assignments…" />
        ) : error || !data ? (
          <ErrorState retry={() => void reload()} />
        ) : !data.assignments.length ? (
          <EmptyState
            title="No assignments yet"
            description="Create your first assignment when you’re ready. Add task files before publishing it to students."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                Create assignment
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.assignments.map((assignment) => (
              <Card key={assignment.id} className="p-5 transition-colors hover:border-primary/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{assignmentStatusLabel(assignment.status)}</Badge>
                      {assignment.lessonTitle && <Badge variant="outline">{assignment.lessonTitle}</Badge>}
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold">{assignment.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{assignment.className}</p>
                  </div>
                  <ClipboardList className="size-5 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4" />
                    {formatDateTime(assignment.dueAt)}
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Users className="size-4" />
                    {assignment.submittedCount ?? 0}/{assignment.totalStudents ?? 0} submitted
                  </p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-muted-foreground">{assignment.reviewedCount ?? 0} reviewed</p>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/teacher/assignments/${assignment.id}`}>Open</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {creating && data && (
        <AssignmentFormDialog
          classes={data.classes}
          onClose={() => setCreating(false)}
          onSave={async (value) => {
            const id = await createAssignment(value)
            setCreating(false)
            await reload()
            navigate(`/teacher/assignments/${id}`)
          }}
        />
      )}
    </AppShell>
  )
}
