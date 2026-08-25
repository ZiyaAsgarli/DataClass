import { useCallback } from 'react'
import { ArrowLeft, BookOpen, Check, Circle, Play, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { ModuleLifecycleBadge } from '@/components/common/ModuleLifecycle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { cn } from '@/lib/utils'
import {
  getMyStudentClassInstructors,
  getMyStudentClassOverview,
} from '@/services/classService'
import { listStudentClassModules } from '@/services/moduleService'
import type { ModuleLifecycleStatus } from '@/types'

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
          <h2 className="text-lg font-semibold">Learning path</h2>
          <p className="text-sm text-muted-foreground">
            The teaching sequence for this class. Completed modules stay available for review.
          </p>
        </div>
        {data.modules.length ? (
          <ol className="space-y-3">
            {data.modules.map((module, index) => (
              <li key={module.id}>
                <Card className={cn('group p-4 transition-colors hover:border-foreground/20 sm:p-5', module.lifecycleStatus === 'active' && 'border-primary/45 bg-accent/25 shadow-sm')}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <ModulePathIcon status={module.lifecycleStatus} position={index + 1} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{module.title}</h3>
                          <ModuleLifecycleBadge status={module.lifecycleStatus} currentLabel />
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{module.description || 'Course lessons and classroom sessions.'}</p>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {module.publishedLessonCount > 0
                            ? `${module.publishedLessonCount} published ${module.publishedLessonCount === 1 ? 'lesson' : 'lessons'}`
                            : module.lifecycleStatus === 'upcoming'
                              ? 'Lessons will appear when this module begins.'
                              : 'No lessons have been published yet.'}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant={module.lifecycleStatus === 'active' ? 'default' : 'outline'} asChild className="w-full sm:w-auto">
                      <Link to={`/student/classes/${classId}/modules/${module.id}`}>Open module</Link>
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
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

function ModulePathIcon({ status, position }: { status: ModuleLifecycleStatus; position: number }) {
  const Icon = status === 'completed' ? Check : status === 'active' ? Play : Circle
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', status === 'active' ? 'border-primary bg-primary text-primary-foreground' : status === 'completed' ? 'border-primary/25 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')} aria-label={`Module ${position}: ${status}`}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  )
}
