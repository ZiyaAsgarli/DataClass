import { useEffect, useState, type FormEvent } from 'react'
import { DialogFrame } from '@/components/common/CourseForms'
import { Button } from '@/components/ui/button'
import { listAssignmentLessonOptions } from '@/services/assignmentService'
import type {
  AssignmentLessonOption,
  AssignmentRecord,
  ManagedClass,
} from '@/types'

export interface AssignmentFormValue {
  classId: string
  lessonId: string | null
  title: string
  description: string
  dueAt: string | null
  allowLate: boolean
}

function localDateTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}

export function AssignmentFormDialog({
  classes,
  initial,
  onClose,
  onSave,
}: {
  classes: ManagedClass[]
  initial?: AssignmentRecord
  onClose: () => void
  onSave: (value: AssignmentFormValue) => Promise<void>
}) {
  const [classId, setClassId] = useState(
    initial?.classId ?? classes[0]?.id ?? '',
  )
  const [lessonId, setLessonId] = useState(initial?.lessonId ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueAt, setDueAt] = useState(localDateTime(initial?.dueAt))
  const [allowLate, setAllowLate] = useState(
    initial?.allowLateSubmission ?? true,
  )
  const [lessons, setLessons] = useState<AssignmentLessonOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    if (!classId) {
      setLessons([])
      return
    }
    void listAssignmentLessonOptions(classId)
      .then((items) => {
        if (live) setLessons(items)
      })
      .catch(() => {
        if (live) setLessons([])
      })
    return () => {
      live = false
    }
  }, [classId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!classId || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      await onSave({
        classId,
        lessonId: lessonId || null,
        title: title.trim(),
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        allowLate,
      })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The assignment could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogFrame
      title={initial ? 'Edit assignment' : 'Create assignment'}
      description="Assignments start as drafts so files can be added before publication."
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          Title *
          <input
            autoFocus
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            placeholder="Excel Task 01 — Lookup Practice"
          />
          <span className="mt-1.5 block text-xs font-normal text-muted-foreground">Use a short name students can recognize easily.</span>
        </label>
        <label className="block text-sm font-medium">
          Class *
          <select
            disabled={Boolean(initial)}
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value)
              setLessonId('')
            }}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">Select a class</option>
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Lesson{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
          <select
            disabled={Boolean(initial)}
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">Class-level assignment</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.moduleTitle} — {lesson.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Description{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea
            maxLength={10000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
          />
        </label>
        <label className="block text-sm font-medium">
          Due date{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          />
          <span className="mt-1.5 block text-xs font-normal text-muted-foreground">Students will see this deadline in their coursework.</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={allowLate}
            onChange={(event) => setAllowLate(event.target.checked)}
          />
          <span>
            <span className="font-medium">Allow late submissions</span>
            <span className="mt-0.5 block text-muted-foreground">
              Late work can still be submitted and will be marked accordingly.
            </span>
          </span>
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !classId || !title.trim()}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Save as draft'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  )
}

export function ReviewDialog({
  action,
  initial = '',
  onClose,
  onSave,
}: {
  action: 'reviewed' | 'revision_requested'
  initial?: string
  onClose: () => void
  onSave: (message: string) => Promise<void>
}) {
  const [message, setMessage] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revision = action === 'revision_requested'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (revision && !message.trim()) return
    setBusy(true)
    setError('')
    try {
      await onSave(message.trim())
    } catch {
      setError('The review could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogFrame
      title={revision ? 'Request revision' : 'Mark reviewed'}
      description={
        revision
          ? 'Tell the student what should be corrected before resubmitting.'
          : 'Confirm that the submitted work has been reviewed.'
      }
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          Feedback{' '}
          {revision ? (
            '*'
          ) : (
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          )}
          <textarea
            autoFocus
            maxLength={5000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-md border bg-background p-3"
            placeholder="XLOOKUP hissəsinə yenidən bax."
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || (revision && !message.trim())}>
            {busy ? 'Saving…' : revision ? 'Request revision' : 'Mark reviewed'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  )
}
