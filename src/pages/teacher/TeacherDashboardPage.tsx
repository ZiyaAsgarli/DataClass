import { useCallback } from 'react'
import { ArrowRight, BookOpen, ClipboardCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ClassCard } from '@/components/teacher/ClassCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/layouts/AppShell'
import { listTeacherAssignments } from '@/services/assignmentService'
import { listTeacherClasses } from '@/services/classService'

export function TeacherDashboardPage() {
  const { profile } = useAuth()
  const firstName = profile?.fullName.split(/\s+/)[0] || 'Teacher'
  const loader = useCallback(async () => ({ classes: await listTeacherClasses(), assignments: await listTeacherAssignments() }), [])
  const { data, loading, error, reload } = useAsyncData(loader)
  const active = data?.classes.filter((course) => course.status === 'active') ?? []
  const students = active.reduce((total, course) => total + course.studentCount, 0)
  const pendingReviews = data?.assignments.reduce((sum, assignment) => sum + (assignment.submittedCount ?? 0) - (assignment.reviewedCount ?? 0), 0) ?? 0
  return <AppShell role="teacher" title="Overview"><div className="animate-enter"><div className="mb-8"><p className="text-sm font-medium text-primary">Teaching workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Good morning, {firstName}</h1><p className="mt-2 text-sm text-muted-foreground">Manage your live DataClass cohorts from one place.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={BookOpen} label="Active Classes" value={loading ? '—' : active.length} /><Metric icon={Users} label="Active Students" value={loading ? '—' : students} /><Metric icon={ClipboardCheck} label="Assignments" value={loading ? '—' : data?.assignments.length ?? 0} /><Metric icon={ClipboardCheck} label="Pending Reviews" value={loading ? '—' : Math.max(0, pendingReviews)} /></div></div><section className="animate-enter-delay mt-8"><SectionHeader title="Recent Classes" description="Your real DataClass learning spaces" action={<Button variant="ghost" size="sm" asChild><Link to="/teacher/classes">View all <ArrowRight /></Link></Button>} />{loading ? <LoadingState /> : error ? <ErrorState retry={() => void reload()} /> : !data?.classes.length ? <EmptyState title="No classes yet" description="Create your first class to begin inviting students." action={<Button asChild><Link to="/teacher/classes">Create a class</Link></Button>} /> : <div className="grid gap-5 xl:grid-cols-2">{data.classes.slice(0, 2).map((course) => <ClassCard key={course.id} course={course} />)}</div>}</section></AppShell>
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string | number }) {
  return <Card className="p-5"><span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary"><Icon className="size-4" /></span><p className="mt-4 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></Card>
}
