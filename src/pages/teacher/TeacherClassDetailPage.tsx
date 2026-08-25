import { useCallback, useId, useState, type FormEvent } from 'react'
import { Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen, MailPlus, Plus, Save, UserPlus, UserRoundCog, Users, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ModuleFormDialog } from '@/components/common/CourseForms'
import { ErrorState, LoadingState } from '@/components/common/DataState'
import { ModuleLifecycleBadge, ModuleLifecycleControl } from '@/components/common/ModuleLifecycle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { dataErrorMessage } from '@/lib/dataErrors'
import { cn } from '@/lib/utils'
import { addInstructor, getClassInstructors, getClassInvitations, getClassOverview, getClassStudents, inviteStudents, removeInstructor, revokeInvitation, updateClass } from '@/services/classService'
import { createModule, listTeacherClassModules, reorderModule, setModuleLifecycle } from '@/services/moduleService'
import type { ModuleLifecycleStatus } from '@/types'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))

export function TeacherClassDetailPage() {
  const { classId = '' } = useParams()
  const loader = useCallback(async () => {
    const overview = await getClassOverview(classId)
    const [students, instructors, invitations, modules] = await Promise.all([getClassStudents(classId), getClassInstructors(classId), overview.currentAccess === 'owner' ? getClassInvitations(classId) : Promise.resolve([]), listTeacherClassModules(classId)])
    return { overview, students, instructors, invitations, modules }
  }, [classId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [instructorOpen, setInstructorOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [creatingModule, setCreatingModule] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  if (loading)
    return (
      <AppShell role="teacher" title="Class">
        <LoadingState label="Loading class workspace…" />
      </AppShell>
    )
  if (error || !data)
    return (
      <AppShell role="teacher" title="Class">
        <ErrorState retry={() => void reload()} message={dataErrorMessage(error, 'You do not have access to this class.', 'The class workspace could not be loaded. Please try again.')} />
      </AppShell>
    )
  const { overview, students, instructors, invitations, modules } = data
  const owner = overview.currentAccess === 'owner'

  const archive = async () => {
    if (!window.confirm('Archive this class? Students and instructors will keep their history.')) return
    try {
      await updateClass(classId, overview.name, overview.description ?? '', 'archived')
      setMessage('Class archived.')
      await reload()
    } catch {
      setMessage('The class could not be archived.')
    }
  }

  const changeModuleLifecycle = async (moduleId: string, status: ModuleLifecycleStatus) => {
    setLifecycleBusy(moduleId)
    setMessage('')
    try {
      await setModuleLifecycle(moduleId, status)
      setMessage(`Module marked ${status}.`)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes('Another module is already active')
        ? 'Another module is already active for this class.'
        : 'The module lifecycle could not be changed.')
    } finally {
      setLifecycleBusy(null)
    }
  }

  return (
    <AppShell role="teacher" title="Class management">
      <div className="animate-enter">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
          <Link to="/teacher/classes">
            <ArrowLeft />
            Back to classes
          </Link>
        </Button>
        <Card className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="capitalize">{overview.status}</Badge>
                <span className="text-xs font-medium capitalize text-muted-foreground">{overview.currentAccess} access</span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{overview.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{overview.description || 'No class description has been added.'}</p>
            </div>
            {owner && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Save />
                  Edit details
                </Button>
                {overview.status !== 'archived' && (
                  <Button variant="outline" onClick={() => void archive()}>
                    <Archive />
                    Archive
                  </Button>
                )}
              </div>
            )}
          </div>
          {message && (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              {message}
            </p>
          )}
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Summary icon={Users} label="Students" value={overview.studentCount} />
            <Summary icon={UserRoundCog} label="Instructors" value={overview.instructorCount} />
            <Summary icon={Save} label="Created" value={formatDate(overview.createdAt)} />
          </div>
        </Card>
      </div>

      <section className="animate-enter-delay mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Modules</h2>
            <p className="text-sm text-muted-foreground">Course sections and their classroom lessons.</p>
          </div>
          {owner && (
            <Button size="sm" onClick={() => setCreatingModule(true)}>
              <Plus />
              Add module
            </Button>
          )}
        </div>
        {modules.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {modules.map((module, index) => (
              <Card key={module.id} className={cn('p-5 transition-colors', module.lifecycleStatus === 'active' && 'border-primary/45 bg-accent/25 shadow-sm')}>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <BookOpen className="size-5" />
                  </span>
                  <div className="flex items-center gap-1">
                    <ModuleLifecycleBadge status={module.lifecycleStatus} currentLabel />
                    {module.status === 'archived' && <Badge variant="outline">Archived availability</Badge>}
                    {owner && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label="Move module up"
                          onClick={async () => {
                            await reorderModule(module.id, 'up')
                            await reload()
                          }}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === modules.length - 1}
                          aria-label="Move module down"
                          onClick={async () => {
                            await reorderModule(module.id, 'down')
                            await reload()
                          }}
                        >
                          <ArrowDown />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{module.title}</h3>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{module.description || 'No module description has been added.'}</p>
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <p>{module.instructorNames.length ? `Instructors: ${module.instructorNames.join(', ')}` : 'Instructor: Not assigned'}</p>
                  <p>
                    {module.lessonCount} {module.lessonCount === 1 ? 'lesson' : 'lessons'} · {module.publishedLessonCount} published
                  </p>
                </div>
                {owner && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                    <span className="text-xs text-muted-foreground">Teaching status</span>
                    <ModuleLifecycleControl status={module.lifecycleStatus} canActivate={module.status === 'active' || module.status === 'completed'} disabled={lifecycleBusy === module.id} onChange={(status) => void changeModuleLifecycle(module.id, status)} />
                  </div>
                )}
                <Button className="mt-5 w-full" variant="outline" asChild>
                  <Link to={`/teacher/classes/${classId}/modules/${module.id}`}>Manage module</Link>
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="flex min-h-40 flex-col items-center justify-center p-6 text-center sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <BookOpen />
            </span>
            <h3 className="mt-4 font-semibold">No modules yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create the first module for this class.</p>
            {owner && (
              <Button className="mt-5" onClick={() => setCreatingModule(true)}>
                <Plus />
                Create module
              </Button>
            )}
          </Card>
        )}
      </section>

      <div className="animate-enter-delay mt-8 grid gap-8 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Students</h2>
              <p className="text-sm text-muted-foreground">Active members of this class</p>
            </div>
            {owner && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <MailPlus />
                Invite students
              </Button>
            )}
          </div>
          <Card className="overflow-hidden">
            {students.length ? (
              <div className="divide-y">
                {students.map((student) => (
                  <div key={student.membershipId} className="flex items-center justify-between gap-4 p-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{student.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                    </div>
                    <Badge className="capitalize">{student.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">No students have joined this class yet.</p>
            )}
          </Card>
          {owner && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold">Pending invitations</h3>
              <Card className="overflow-hidden">
                {invitations.filter((item) => item.status === 'pending').length ? (
                  <div className="divide-y">
                    {invitations
                      .filter((item) => item.status === 'pending')
                      .map((invitation) => (
                        <div key={invitation.id} className="flex items-center justify-between gap-4 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{invitation.email}</p>
                            <p className="text-xs text-muted-foreground">Invited {formatDate(invitation.createdAt)}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await revokeInvitation(invitation.id)
                              await reload()
                            }}
                          >
                            Revoke
                          </Button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">No pending invitations.</p>
                )}
              </Card>
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Instructors</h2>
              <p className="text-sm text-muted-foreground">Owner and participating teachers</p>
            </div>
            {owner && (
              <Button size="sm" variant="outline" onClick={() => setInstructorOpen(true)}>
                <UserPlus />
                Add instructor
              </Button>
            )}
          </div>
          <Card className="divide-y overflow-hidden">
            {instructors.map((instructor) => (
              <div key={instructor.relationshipId} className="flex items-center justify-between gap-4 p-4 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{instructor.fullName}</p>
                    <Badge className="capitalize">{instructor.role === 'owner' ? 'Owner / Lead' : 'Instructor'}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{instructor.email}</p>
                </div>
                {owner && instructor.role === 'instructor' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await removeInstructor(classId, instructor.teacherId)
                      await reload()
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </section>
      </div>

      {editing && (
        <EditDialog
          initialName={overview.name}
          initialDescription={overview.description ?? ''}
          onClose={() => setEditing(false)}
          onSave={async (name, description) => {
            await updateClass(classId, name, description, overview.status)
            setEditing(false)
            await reload()
          }}
        />
      )}
      {creatingModule && (
        <ModuleFormDialog
          onClose={() => setCreatingModule(false)}
          onSave={async (title, description) => {
            await createModule(classId, title, description)
            setCreatingModule(false)
            await reload()
          }}
        />
      )}
      {inviteOpen && (
        <InviteDialog
          onClose={() => {
            setInviteOpen(false)
            void reload()
          }}
          onInvite={(emails) => inviteStudents(classId, emails)}
        />
      )}
      {instructorOpen && (
        <InstructorDialog
          onClose={() => setInstructorOpen(false)}
          onAdd={async (email) => {
            const outcome = await addInstructor(classId, email)
            if (outcome === 'created') {
              await reload()
              setInstructorOpen(false)
            }
            return outcome
          }}
        />
      )}
    </AppShell>
  )
}

function Summary({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/45 p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X />
          </Button>
        </div>
        {children}
      </Card>
    </div>
  )
}

function EditDialog({ initialName, initialDescription, onClose, onSave }: { initialName: string; initialDescription: string; onClose: () => void; onSave: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title="Edit class" description="Update the class name or description." onClose={onClose}>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          void onSave(name, description)
            .catch(() => setError('Changes could not be saved.'))
            .finally(() => setBusy(false))
        }}
      >
        <label className="block text-sm font-medium">
          Class name
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function InviteDialog({ onClose, onInvite }: { onClose: () => void; onInvite: (emails: string[]) => Promise<{ email: string; outcome: string }[]> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const emails = [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  const invalid = emails.filter((email) => !emailPattern.test(email))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!emails.length || invalid.length) return
    setBusy(true)
    try {
      const result = await onInvite(emails)
      const created = result.filter((item) => item.outcome === 'created').length
      const skipped = result.length - created
      setFeedback(`${created} invitation${created === 1 ? '' : 's'} created${skipped ? `; ${skipped} skipped` : ''}.`)
    } catch {
      setFeedback('Invitations could not be created.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Invite students" description="Students join automatically when they sign in with an invited email. Separate addresses with a new line, comma, or semicolon." onClose={onClose}>
      <form className="mt-6" onSubmit={(event) => void submit(event)}>
        <textarea
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setFeedback('')
          }}
          className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
          placeholder={'student1@gmail.com\nstudent2@gmail.com'}
        />
        {invalid.length > 0 && (
          <p className="mt-2 text-sm text-destructive">
            Check {invalid.length} invalid email {invalid.length === 1 ? 'address' : 'addresses'}.
          </p>
        )}
        {feedback && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {feedback}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy || !emails.length || invalid.length > 0}>{busy ? 'Inviting…' : `Invite ${emails.length || ''} student${emails.length === 1 ? '' : 's'}`}</Button>
        </div>
      </form>
    </Modal>
  )
}

function InstructorDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (email: string) => Promise<string> }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title="Add instructor" description="The teacher must already have a provisioned DataClass teacher account." onClose={onClose}>
      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!emailPattern.test(email.trim())) {
            setError('Enter a valid email address.')
            return
          }
          setBusy(true)
          setError('')
          void onAdd(email.trim())
            .then((outcome) => {
              if (outcome !== 'created') setError(outcome === 'not_found' ? 'Teacher account not found or not yet provisioned.' : outcome === 'owner' ? 'The class owner is already assigned.' : 'This instructor is already assigned.')
            })
            .catch(() => setError('The instructor could not be added.'))
            .finally(() => setBusy(false))
        }}
      >
        <label className="block text-sm font-medium">
          Teacher email
          <input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3" placeholder="teacher@example.com" />
        </label>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? 'Adding…' : 'Add instructor'}</Button>
        </div>
      </form>
    </Modal>
  )
}
