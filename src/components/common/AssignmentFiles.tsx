import { useCallback, useRef, useState } from 'react'
import { Download, Loader2, Send, UploadCloud } from 'lucide-react'
import { ResourceRows } from '@/components/common/LessonResources'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { formatBytes } from '@/lib/files'
import { submitMyAssignment } from '@/services/assignmentService'
import {
  deleteAssignmentResource,
  getAssignmentResourceDownloadUrl,
  getSubmissionFileDownloadUrl,
  listStudentAssignmentResources,
  listTeacherAssignmentResources,
  uploadAssignmentResource,
  uploadSubmissionFile,
  validateResourceFile,
} from '@/services/storageService'
import type { SubmissionFileRecord } from '@/types'

function UploadButton({ label, multiple = false, upload, disabled = false }: {
  label: string
  multiple?: boolean
  upload: (files: File[], onProgress: (percent: number) => void) => Promise<void>
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const select = async (files: FileList | null) => {
    if (!files?.length) return
    const chosen = Array.from(files)
    const issue = chosen.map(validateResourceFile).find(Boolean)
    if (issue) { setError(issue); return }
    setBusy(true); setProgress(0); setError('')
    try { await upload(chosen, setProgress) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The file upload failed.') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  return <div><input ref={ref} type="file" multiple={multiple} className="hidden" onChange={(event) => void select(event.target.files)} /><Button disabled={disabled || busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}{busy ? `Uploading ${progress}%` : label}</Button>{error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}</div>
}

export function TeacherAssignmentResources({ assignmentId }: { assignmentId: string }) {
  const loader = useCallback(() => listTeacherAssignmentResources(assignmentId), [assignmentId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  return <Card className="p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">Assignment files</h2><p className="mt-1 text-sm text-muted-foreground">Private task files students can download after publication.</p></div><UploadButton label="Upload file" upload={async ([file], progress) => { await uploadAssignmentResource(assignmentId, file, progress); await reload() }} /></div>{actionError && <p className="mt-4 text-sm text-destructive">{actionError}</p>}<div className="mt-5">{loading ? <p className="text-sm text-muted-foreground">Loading files…</p> : error || !data ? <Button variant="outline" onClick={() => void reload()}>Try again</Button> : <ResourceRows resources={data} canDelete busyId={busyId} getDownloadUrl={getAssignmentResourceDownloadUrl} emptyTitle="No assignment files" emptyDescription="Upload task files or datasets when they are ready." onDelete={(resource) => { if (!window.confirm(`Delete ${resource.fileName}?`)) return; setBusyId(resource.id); setActionError(''); void deleteAssignmentResource(resource.id).then(() => reload()).catch(() => setActionError('The file could not be deleted.')).finally(() => setBusyId(null)) }} />}</div></Card>
}

export function StudentAssignmentResources({ assignmentId }: { assignmentId: string }) {
  const loader = useCallback(() => listStudentAssignmentResources(assignmentId), [assignmentId])
  const { data, loading, error, reload } = useAsyncData(loader)
  return <Card className="p-5 sm:p-7"><h2 className="font-semibold">Assignment files</h2><p className="mt-1 text-sm text-muted-foreground">Download the task instructions and source files.</p><div className="mt-5">{loading ? <p className="text-sm text-muted-foreground">Loading files…</p> : error || !data ? <Button variant="outline" onClick={() => void reload()}>Try again</Button> : <ResourceRows resources={data} canDelete={false} busyId={null} getDownloadUrl={getAssignmentResourceDownloadUrl} emptyTitle="No files attached" emptyDescription="This assignment has no downloadable files." />}</div></Card>
}

async function downloadSubmissionFile(file: SubmissionFileRecord) {
  const { downloadUrl } = await getSubmissionFileDownloadUrl(file.id)
  const link = document.createElement('a')
  link.href = downloadUrl; link.download = file.fileName; link.rel = 'noreferrer'
  document.body.appendChild(link); link.click(); link.remove()
}

export function SubmissionFileList({ files }: { files: SubmissionFileRecord[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!files.length) return <p className="text-sm text-muted-foreground">No submitted files yet.</p>
  const versions = Array.from(new Set(files.map((file) => file.version))).sort((a, b) => b - a)
  return <div className="space-y-5">{error && <p className="text-sm text-destructive">{error}</p>}{versions.map((version) => <div key={version}><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Version {version}</p><div className="space-y-2">{files.filter((file) => file.version === version).map((file) => <div key={file.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium">{file.fileName}</p><p className="mt-1 text-xs uppercase text-muted-foreground">{file.resourceKind} · {formatBytes(file.fileSizeBytes)}</p></div><Button size="sm" variant="ghost" disabled={busy === file.id} onClick={() => { setBusy(file.id); setError(''); void downloadSubmissionFile(file).catch(() => setError('The submission file could not be downloaded.')).finally(() => setBusy(null)) }}>{busy === file.id ? <Loader2 className="animate-spin" /> : <Download />}Download</Button></div>)}</div></div>)}</div>
}

export function StudentSubmissionUpload({ assignmentId, revision, onSubmitted }: { assignmentId: string; revision: boolean; onSubmitted: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [error, setError] = useState('')
  return <div className="rounded-lg border border-dashed p-5"><h3 className="font-medium">{revision ? 'Upload revised solution' : 'Upload solution'}</h3><p className="mt-1 text-sm text-muted-foreground">Choose one or more supported files. Previous submitted versions are preserved.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"><UploadButton multiple label={uploaded ? `${uploaded} file${uploaded === 1 ? '' : 's'} ready` : 'Choose files'} disabled={submitting} upload={async (files, progress) => { for (const file of files) await uploadSubmissionFile(assignmentId, file, progress); setUploaded((value) => value + files.length) }} /><Button disabled={!uploaded || submitting} onClick={() => { setSubmitting(true); setError(''); void submitMyAssignment(assignmentId).then(onSubmitted).catch((caught) => setError(caught instanceof Error ? caught.message : 'The assignment could not be submitted.')).finally(() => setSubmitting(false)) }}>{submitting ? <Loader2 className="animate-spin" /> : <Send />}{revision ? 'Resubmit work' : 'Submit assignment'}</Button></div>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}</div>
}
