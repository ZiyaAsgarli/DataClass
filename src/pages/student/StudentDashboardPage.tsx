import { useCallback } from 'react'
import { AlertTriangle, ArrowRight, BookOpen, ClipboardList, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { formatDateTime, studentAssignmentLabel } from '@/lib/assignments'
import { listStudentAssignments } from '@/services/assignmentService'
import { listStudentClasses } from '@/services/classService'
import { listStudentClassModules } from '@/services/moduleService'
import type { AssignmentRecord, CourseModuleRecord, ManagedClass } from '@/types'

interface StudentDashboardData {
  classes: ManagedClass[]
  assignments: AssignmentRecord[]
  modules: CourseModuleRecord[]
}

export function StudentDashboardPage() {
  const { profile } = useAuth()
  const firstName = profile?.fullName.split(/\s+/)[0] || 'Student'
  const loader = useCallback(async (): Promise<StudentDashboardData> => {
    const [classes, assignments] = await Promise.all([listStudentClasses(), listStudentAssignments()])
    const modules = (await Promise.all(classes.filter((course) => course.status === 'active').map((course) => listStudentClassModules(course.id)))).flat()
    return { classes, assignments, modules }
  }, [])
  const { data, loading, error, reload } = useAsyncData(loader)

  return (
    <AppShell role="student" title="Overview">
      <div className="animate-enter mb-8">
        <h1 className="page-title">Welcome back, {firstName}</h1>
        <p className="page-description">See your classes and the coursework that needs attention.</p>
      </div>
      {loading ? <LoadingState label="Loading your student overview…" /> : error || !data ? <ErrorState retry={() => void reload()} message="Your student overview could not be loaded. Please try again." /> : <DashboardContent data={data} />}
    </AppShell>
  )
}

function DashboardContent({ data }: { data: StudentDashboardData }) {
  const activeClasses = data.classes.filter((course) => course.status === 'active')
  const revisionCount = data.assignments.filter((assignment) => assignment.submissionStatus === 'revision_requested').length
  const attention = data.assignments
    .filter((assignment) => !assignment.submissionStatus || assignment.submissionStatus === 'draft' || assignment.submissionStatus === 'revision_requested')
    .sort((left, right) => {
      const priority = (status: AssignmentRecord['submissionStatus']) => status === 'revision_requested' ? 0 : 1
      const priorityDifference = priority(left.submissionStatus) - priority(right.submissionStatus)
      if (priorityDifference !== 0) return priorityDifference
      return (left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER) - (right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER)
    })
  const activeModule = data.modules.find((module) => module.lifecycleStatus === 'active')

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Metric icon={BookOpen} label="Active classes" value={activeClasses.length} />
        <Metric icon={ClipboardList} label="Published assignments" value={data.assignments.length} />
        <Metric icon={AlertTriangle} label="Needs action" value={attention.length} />
        <Metric icon={RotateCcw} label="Revision requested" value={revisionCount} />
      </div>
      {activeModule ? (
        <Card className="mt-6 overflow-hidden border-primary/25 bg-accent/35 p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current module</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{activeModule.title}</p><p className="mt-1 text-sm text-muted-foreground">This is the module your class is currently studying.</p></div>
            <Button size="sm" variant="outline" asChild><Link to={`/student/classes/${activeModule.classId}/modules/${activeModule.id}`}>Open module</Link></Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-5 flex flex-col gap-1 border-primary/10 bg-accent/15 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current module</p>
          <span className="hidden text-border sm:inline">•</span>
          <p className="text-sm"><span className="font-medium">Next module has not been activated yet.</span> <span className="text-muted-foreground">Completed modules remain available in My Classes.</span></p>
        </Card>
      )}
      <section className="mt-8">
        <SectionHeader
          title="What should I do now?"
          description="Assignments and feedback that need your attention"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/assignments">
                All assignments <ArrowRight />
              </Link>
            </Button>
          }
        />
        {attention.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {attention.slice(0, 4).map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        ) : (
          <Card className="px-5 py-4 text-center">
            <p className="font-medium">Nothing needs your attention</p>
            <p className="mt-1 text-sm text-muted-foreground">New assignments and revision requests will appear here.</p>
          </Card>
        )}
      </section>
      <section className="animate-enter-delay mt-8">
        <SectionHeader
          title="My classes"
          description={`${activeClasses.length} active ${activeClasses.length === 1 ? 'class' : 'classes'}`}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/classes">
                View all <ArrowRight />
              </Link>
            </Button>
          }
        />
        {!data.classes.length ? (
          <EmptyState title="No classes yet" description="Once your teacher adds your email to a class, it will appear here after you sign in." />
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {data.classes.slice(0, 2).map((course) => (
              <Card key={course.id} className="p-5 sm:p-6">
                <div className="flex items-start justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <BookOpen />
                  </span>
                  <StatusBadge status={course.status} label={course.status[0].toUpperCase() + course.status.slice(1)} />
                </div>
                <h2 className="mt-5 text-lg font-semibold">{course.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{course.description || 'No description added.'}</p>
                <p className="mt-4 text-xs text-muted-foreground">Lead teacher: {course.ownerName}</p>
                <Button className="mt-5" size="sm" variant="outline" asChild>
                  <Link to={`/student/classes/${course.id}`}>Open class</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function AssignmentCard({ assignment }: { assignment: AssignmentRecord }) {
  return (
    <Card className={assignment.submissionStatus === 'revision_requested' ? 'flex flex-col gap-4 border-rose-300/60 bg-rose-50/70 p-5 dark:border-rose-900 dark:bg-rose-950/20 sm:flex-row sm:items-center sm:justify-between' : 'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between'}>
      <div className="min-w-0">
        <StatusBadge status={assignment.submissionStatus ?? 'upcoming'} label={studentAssignmentLabel(assignment)} />
        <h2 className="mt-2 truncate font-semibold">{assignment.title}</h2>
        <p className="mt-1 text-sm text-foreground/80">{assignment.submissionStatus === 'revision_requested' ? 'Your teacher left feedback for your next version.' : 'A published assignment is ready for you.'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {assignment.className} · {formatDateTime(assignment.dueAt)}
        </p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link to={`/student/assignments/${assignment.id}`}>{assignment.submissionStatus === 'revision_requested' ? 'View feedback' : 'Open assignment'}</Link>
      </Button>
    </Card>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <Card className="border-[var(--strong-border)] p-4">
      <span className="icon-tile size-9 rounded-lg">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 font-['Hanken_Grotesk'] text-[1.65rem] font-bold leading-none tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}
