import { useCallback } from 'react'
import { ArrowLeft, BookOpen, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { getMyStudentClassInstructors, getMyStudentClassOverview } from '@/services/classService'

export function StudentClassPage() {
  const { classId = '' } = useParams()
  const loader = useCallback(async () => ({ overview: await getMyStudentClassOverview(classId), instructors: await getMyStudentClassInstructors(classId) }), [classId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading) return <AppShell role="student" title="My Classes"><LoadingState label="Loading class…" /></AppShell>
  if (error || !data) return <AppShell role="student" title="My Classes"><ErrorState retry={() => void reload()} message="This class does not exist or you are not a member." /></AppShell>
  return <AppShell role="student" title="My Classes"><Button variant="ghost" size="sm" asChild className="-ml-2 mb-5"><Link to="/student/classes"><ArrowLeft />Back to classes</Link></Button><Card className="animate-enter p-5 sm:p-7"><Badge className="capitalize">{data.overview.status}</Badge><h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.overview.name}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{data.overview.description || 'No class description has been added.'}</p><div className="mt-6 flex flex-wrap gap-3">{data.instructors.map((teacher) => <div key={teacher.relationshipId} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3"><UserRound className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium">{teacher.fullName}</p><p className="text-xs text-muted-foreground">{teacher.role === 'owner' ? 'Owner / Lead Teacher' : 'Instructor'}</p></div></div>)}</div></Card><Card className="animate-enter-delay mt-6 flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary"><BookOpen /></span><h2 className="mt-4 font-semibold">Course content is coming next</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Modules and classroom lessons will appear here when your teacher publishes them in a later step.</p></Card></AppShell>
}
