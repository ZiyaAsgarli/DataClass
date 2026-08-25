import { useCallback, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState'
import { ClassCard } from '@/components/teacher/ClassCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { AppShell } from '@/layouts/AppShell'
import { createClass, listTeacherClasses } from '@/services/classService'

function CreateClassDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Class name is required.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      navigate(`/teacher/classes/${await createClass(name, description)}`)
    } catch {
      setError('The class could not be created. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-class-title"
    >
      <Card className="w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="create-class-title" className="text-xl font-semibold">
              Create a class
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new learning space for your cohort.
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>
        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-medium">
            Class name *
            <input
              autoFocus
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Data Analytics — Batch 01"
            />
            <span className="mt-1.5 block text-xs font-normal text-muted-foreground">Use the course and batch name students will recognize.</span>
          </label>
          <label className="block text-sm font-medium">
            Description{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
            <textarea
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 min-h-28 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Add a short description for this class."
            />
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create class'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export function TeacherClassesPage() {
  const [creating, setCreating] = useState(false)
  const loader = useCallback(() => listTeacherClasses(), [])
  const { data, loading, error, reload } = useAsyncData(loader)
  return (
    <AppShell role="teacher" title="Classes">
      <div className="animate-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Teaching workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            My Classes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create and manage your active course cohorts.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Create class
        </Button>
      </div>
      <div className="animate-enter-delay mt-8">
        {loading ? (
          <LoadingState label="Loading your classes…" />
        ) : error ? (
          <ErrorState retry={() => void reload()} />
        ) : !data?.length ? (
          <EmptyState
            title="No classes yet"
            description="Create your first class to begin inviting students and instructors."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                Create class
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {data.map((course) => (
              <ClassCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
      {creating && <CreateClassDialog onClose={() => setCreating(false)} />}
    </AppShell>
  )
}
