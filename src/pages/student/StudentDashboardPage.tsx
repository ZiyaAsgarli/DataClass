import { useCallback } from 'react'
import { AlertTriangle, ArrowRight, BookOpen, ClipboardList, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { Badge } from '@/components/ui/badge'
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
        <p className="text-sm font-medium text-primary">Student workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Welcome back, {firstName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">See your classes and the coursework that needs attention.</p>
      </div>
      {loading ? <LoadingState label="Loading your student overview…" /> : error || !data ? <ErrorState retry={() => void reload()} message="Your student overview could not be loaded. Please try again." /> : <DashboardContent data={data} />}
    </AppShell>
  )
}

function DashboardContent({ data }: { data: StudentDashboardData }) {
  const activeClasses = data.classes.filter((course) => course.status === 'active')
  const revisionCount = data.assignments.filter((assignment) => assignment.submissionStatus === 'revision_requested').length
  const attention = data.assignments.filter((assignment) => !assignment.submissionStatus || assignment.submissionStatus === 'draft' || assignment.submissionStatus === 'revision_requested')
  const activeModule = data.modules.find((module) => module.lifecycleStatus === 'active')

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BookOpen} label="Active classes" value={activeClasses.length} />
        <Metric icon={ClipboardList} label="Published assignments" value={data.assignments.length} />
        <Metric icon={AlertTriangle} label="Needs action" value={attention.length} />
        <Metric icon={RotateCcw} label="Revision requested" value={revisionCount} />
      </div>
      <Card className="mt-6 border-primary/15 bg-accent/20 p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current module</p>
        {activeModule ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{activeModule.title}</p><p className="mt-1 text-sm text-muted-foreground">This is the module your class is currently studying.</p></div>
            <Button size="sm" variant="outline" asChild><Link to={`/student/classes/${activeModule.classId}/modules/${activeModule.id}`}>Open module</Link></Button>
          </div>
        ) : (
          <div className="mt-3"><p className="font-semibold">Next module has not been activated yet</p><p className="mt-1 text-sm text-muted-foreground">Completed modules remain available from My Classes.</p></div>
        )}
      </Card>
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
          <Card className="p-6 text-center">
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
                  <Badge className="capitalize">{course.status}</Badge>
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
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Badge variant={assignment.submissionStatus === 'revision_requested' ? 'outline' : 'default'}>{studentAssignmentLabel(assignment)}</Badge>
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
    <Card className="p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}
