import { useCallback } from 'react'
import { ArrowRight, BookOpen, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { listStudentClasses } from '@/services/classService'

export function StudentClassesPage() {
  const loader = useCallback(() => listStudentClasses(), [])
  const { data, loading, error, reload } = useAsyncData(loader)
  return <AppShell role="student" title="My Classes"><div className="animate-enter"><p className="text-sm font-medium text-primary">Student workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">My Classes</h1><p className="mt-2 text-sm text-muted-foreground">Your active DataClass learning spaces.</p></div><div className="animate-enter-delay mt-8">{loading ? <LoadingState label="Loading your classes…" /> : error ? <ErrorState retry={() => void reload()} /> : !data?.length ? <EmptyState title="No classes yet" description="Once your teacher adds your email to a class, it will appear here after you sign in." /> : <div className="grid gap-5 xl:grid-cols-2">{data.map((course) => <Card key={course.id} className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-6"><div className="flex items-start justify-between gap-4"><span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><BookOpen className="size-5" /></span><Badge className="capitalize">{course.status}</Badge></div><h2 className="mt-5 text-lg font-semibold">{course.name}</h2><p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{course.description || 'No description added.'}</p><div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Users className="size-3.5" />{course.studentCount} students</span><span>Lead: {course.ownerName}</span></div><Button className="mt-5" size="sm" variant="outline" asChild><Link to={`/student/classes/${course.id}`}>Open class <ArrowRight /></Link></Button></Card>)}</div>}</div></AppShell>
}
