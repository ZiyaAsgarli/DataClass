import { useCallback } from 'react'
import { ArrowRight, BookOpen, CalendarDays, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { studentAssignmentLabel } from '@/lib/assignments'
import { listStudentAssignments } from '@/services/assignmentService'
import { listStudentClasses } from '@/services/classService'

export function StudentDashboardPage() {
  const { profile } = useAuth()
  const firstName = profile?.fullName.split(/\s+/)[0] || 'Student'
  const loader = useCallback(async () => ({ classes: await listStudentClasses(), assignments: await listStudentAssignments() }), [])
  const { data, loading, error, reload } = useAsyncData(loader)

  return <AppShell role="student" title="Overview">
    <div className="animate-enter mb-8">
      <p className="text-sm font-medium text-primary">Student workspace</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Good morning, {firstName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your real class memberships appear here automatically after sign-in.</p>
    </div>
    <section className="animate-enter-delay">
      <SectionHeader title="My Classes" description={loading ? 'Loading memberships…' : `${data?.classes.length ?? 0} active learning space${data?.classes.length === 1 ? '' : 's'}`} action={<Button variant="ghost" size="sm" asChild><Link to="/student/classes">View all <ArrowRight /></Link></Button>} />
      {loading ? <LoadingState /> : error ? <ErrorState retry={() => void reload()} /> : !data?.classes.length ? <EmptyState title="No classes yet" description="Once your teacher adds your email to a class, it will appear here after you sign in." /> : <div className="grid gap-5 xl:grid-cols-2">{data.classes.slice(0, 2).map((course) => <Card key={course.id} className="p-5 sm:p-6"><div className="flex items-start justify-between"><span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><BookOpen /></span><Badge className="capitalize">{course.status}</Badge></div><h2 className="mt-5 text-lg font-semibold">{course.name}</h2><p className="mt-2 text-sm text-muted-foreground">{course.description || 'No description added.'}</p><p className="mt-4 text-xs text-muted-foreground">Lead teacher: {course.ownerName}</p><Button className="mt-5" size="sm" variant="outline" asChild><Link to={`/student/classes/${course.id}`}>Open class</Link></Button></Card>)}</div>}
    </section>
    <section className="mt-8"><SectionHeader title="Assignments" description={`${data?.assignments.length ?? 0} published task${data?.assignments.length === 1 ? '' : 's'}`} action={<Button variant="ghost" size="sm" asChild><Link to="/student/assignments">View all <ArrowRight /></Link></Button>} />{data?.assignments.length ? <div className="grid gap-3 lg:grid-cols-2">{data.assignments.slice(0, 2).map((assignment) => <Card key={assignment.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-medium">{assignment.title}</p><p className="mt-1 text-xs text-muted-foreground">{studentAssignmentLabel(assignment)}</p></div><ClipboardList className="size-5 shrink-0 text-muted-foreground" /></Card>)}</div> : <Card className="p-6 text-center text-sm text-muted-foreground">No published assignments yet.</Card>}</section>
    <section className="mt-8">
      <SectionHeader title="Course structure" description="Real modules and published classroom lessons" />
      <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center"><CalendarDays className="size-6 text-muted-foreground" /><h2 className="mt-3 font-semibold">Continue from your class</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Open a class to browse its modules and every lesson your teacher has published.</p></Card>
    </section>
  </AppShell>
}
