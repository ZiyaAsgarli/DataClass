import { useCallback } from 'react'
import { ArrowLeft, BookOpen, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import {
  getMyStudentClassInstructors,
  getMyStudentClassOverview,
} from '@/services/classService'
import { listStudentClassModules } from '@/services/moduleService'

export function StudentClassPage() {
  const { classId = '' } = useParams()
  const loader = useCallback(async () => {
    const [overview, instructors, modules] = await Promise.all([
      getMyStudentClassOverview(classId),
      getMyStudentClassInstructors(classId),
      listStudentClassModules(classId),
    ])
    return { overview, instructors, modules }
  }, [classId])
  const { data, loading, error, reload } = useAsyncData(loader)
  if (loading)
    return (
      <AppShell role="student" title="My Classes">
        <LoadingState label="Loading class…" />
      </AppShell>
    )
  if (error || !data)
    return (
      <AppShell role="student" title="My Classes">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            'This class does not exist or you are not a member.',
            'The class could not be loaded. Please try again.',
          )}
        />
      </AppShell>
    )
  return (
    <AppShell role="student" title="My Classes">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to="/student/classes">
          <ArrowLeft />
          Back to classes
        </Link>
      </Button>
      <Card className="animate-enter p-5 sm:p-7">
        <Badge className="capitalize">{data.overview.status}</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
          {data.overview.name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {data.overview.description || 'No class description has been added.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {data.instructors.map((teacher) => (
            <div
              key={teacher.relationshipId}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3"
            >
              <UserRound className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{teacher.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {teacher.role === 'owner'
                    ? 'Owner / Lead Teacher'
                    : 'Instructor'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <section className="animate-enter-delay mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Modules</h2>
          <p className="text-sm text-muted-foreground">
            Published classroom structure and available lessons.
          </p>
        </div>
        {data.modules.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.modules.map((module) => (
              <Card
                key={module.id}
                className="group p-5 transition-colors hover:border-foreground/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <BookOpen className="size-5" />
                  </span>
                  <Badge className="capitalize">{module.status}</Badge>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{module.title}</h3>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                  {module.description ||
                    'Course lessons and classroom sessions.'}
                </p>
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <span className="text-xs font-medium text-muted-foreground">
                    {module.publishedLessonCount} published{' '}
                    {module.publishedLessonCount === 1 ? 'lesson' : 'lessons'}
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link
                      to={`/student/classes/${classId}/modules/${module.id}`}
                    >
                      Open module
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="flex min-h-40 flex-col items-center justify-center p-6 text-center sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <BookOpen />
            </span>
            <h2 className="mt-4 font-semibold">No modules yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Your teacher has not published the course structure yet. Nothing is required from you.
            </p>
          </Card>
        )}
      </section>
    </AppShell>
  )
}
