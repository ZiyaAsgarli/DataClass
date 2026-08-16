import { useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { LessonLifecycleStatus, ModuleStatus } from '@/types'

export function DialogFrame({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true"><Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button></div>{children}</Card></div>
}

export function ModuleFormDialog({ initial, allowStatus = false, onClose, onSave }: {
  initial?: { title: string; description: string; status: ModuleStatus }
  allowStatus?: boolean
  onClose: () => void
  onSave: (title: string, description: string, status: ModuleStatus) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<ModuleStatus>(initial?.status ?? 'active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!title.trim()) return
    setBusy(true); setError('')
    try { await onSave(title, description, status) }
    catch { setError('The module could not be saved. Please try again.') }
    finally { setBusy(false) }
  }
  return <DialogFrame title={initial ? 'Edit module' : 'Create module'} description="Organize classroom lessons into a focused course section." onClose={onClose}><form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-medium">Module name *<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3" placeholder="Excel" /></label><label className="block text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span><textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" /></label>{allowStatus && <label className="block text-sm font-medium">Status<select value={status} onChange={(event) => setStatus(event.target.value as ModuleStatus)} className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>}{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !title.trim()}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create module'}</Button></div></form></DialogFrame>
}

export function LessonFormDialog({ initial, onClose, onSave }: {
  initial?: { title: string; description: string; lessonDate: string; status: LessonLifecycleStatus }
  onClose: () => void
  onSave: (title: string, description: string, lessonDate: string, status: LessonLifecycleStatus) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [lessonDate, setLessonDate] = useState(initial?.lessonDate ?? '')
  const [status] = useState<LessonLifecycleStatus>(initial?.status ?? 'draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!title.trim()) return
    setBusy(true); setError('')
    try { await onSave(title, description, lessonDate, status) }
    catch { setError('The lesson could not be saved. Please try again.') }
    finally { setBusy(false) }
  }
  return <DialogFrame title={initial ? 'Edit lesson' : 'Create lesson'} description="Add the metadata for an in-person classroom session." onClose={onClose}><form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-medium">Title *<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3" placeholder="Excel Basics" /></label><label className="block text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span><textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" /></label><label className="block text-sm font-medium">Lesson date <span className="font-normal text-muted-foreground">(optional)</span><input type="date" value={lessonDate} onChange={(event) => setLessonDate(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3" /></label><p className="text-xs text-muted-foreground">New lessons start as drafts. Publish when students should see them.</p>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !title.trim()}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create lesson'}</Button></div></form></DialogFrame>
}
