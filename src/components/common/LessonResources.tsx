import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Download, FileArchive, FileSpreadsheet, FileText, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  deleteLessonResource,
  getLessonResourceDownloadUrl,
  listStudentLessonResources,
  listTeacherLessonResources,
  uploadLessonResource,
  validateResourceFile,
} from '@/services/storageService'
import type { LessonResourceRecord } from '@/types'

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 ** 2).toFixed(value >= 100 * 1024 ** 2 ? 0 : 1)} MiB`
}

function resourceIcon(kind: string) {
  if (['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pbix', 'pbit', 'parquet'].includes(kind)) return FileSpreadsheet
  if (kind === 'zip') return FileArchive
  return FileText
}

async function startDownload(resource: LessonResourceRecord) {
  const { downloadUrl } = await getLessonResourceDownloadUrl(resource.id)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = resource.fileName
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function ResourceRows({ resources, canDelete, busyId, onDelete }: {
  resources: LessonResourceRecord[]
  canDelete: boolean
  busyId: string | null
  onDelete?: (resource: LessonResourceRecord) => void
}) {
  const [downloadId, setDownloadId] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (resources.length === 0) return <div className="rounded-lg border border-dashed p-7 text-center"><p className="font-medium">No lesson resources yet</p><p className="mt-1 text-sm text-muted-foreground">Files added for this lesson will appear here.</p></div>
  return <div className="space-y-2">{error && <p className="text-sm text-destructive" role="alert">{error}</p>}{resources.map((resource) => { const Icon = resourceIcon(resource.resourceKind); return <div key={resource.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-5 text-muted-foreground" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{resource.title || resource.fileName}</p><p className="mt-0.5 truncate text-xs uppercase text-muted-foreground">{resource.resourceKind} · {formatBytes(resource.fileSizeBytes)}</p></div></div><div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" disabled={downloadId === resource.id} onClick={() => { setDownloadId(resource.id); setError(''); void startDownload(resource).catch(() => setError('The resource could not be downloaded.')).finally(() => setDownloadId(null)) }}>{downloadId === resource.id ? <Loader2 className="animate-spin" /> : <Download />}Download</Button>{canDelete && onDelete && <Button size="sm" variant="ghost" disabled={busyId === resource.id} onClick={() => onDelete(resource)}>{busyId === resource.id ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete</Button>}</div></div>})}</div>
}

export function TeacherLessonResources({ lessonId, canManage }: { lessonId: string; canManage: boolean }) {
  const loader = useCallback(() => listTeacherLessonResources(lessonId), [lessonId])
  const { data, loading, error, reload } = useAsyncData(loader)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const upload = async (file?: File) => {
    if (!file) return
    const validation = validateResourceFile(file)
    if (validation) { setActionError(validation); return }
    setUploading(true); setProgress(0); setActionError('')
    try { await uploadLessonResource(lessonId, file, setProgress); await reload() }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : 'The resource could not be uploaded.') }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!uploading) void upload(event.dataTransfer.files[0]) }

  return <Card className="mt-6 p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">Lesson resources</h2><p className="mt-1 text-sm text-muted-foreground">Private course files, up to 500 MiB each.</p></div>{canManage && <><input ref={inputRef} className="hidden" type="file" onChange={(event) => void upload(event.target.files?.[0])} /><Button disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}{uploading ? `Uploading ${progress}%` : 'Upload resource'}</Button></>}</div>{canManage && <div className="mt-5 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground" onDragOver={(event) => event.preventDefault()} onDrop={drop}>Drag and drop a supported course file here, or use Upload resource.</div>}{actionError && <p className="mt-4 text-sm text-destructive" role="alert">{actionError}</p>}<div className="mt-5">{loading ? <p className="text-sm text-muted-foreground">Loading resources…</p> : error || !data ? <div><p className="text-sm text-destructive">Resources could not be loaded.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void reload()}>Try again</Button></div> : <ResourceRows resources={data} canDelete={canManage} busyId={busyId} onDelete={(resource) => { if (!window.confirm(`Delete ${resource.fileName}?`)) return; setBusyId(resource.id); setActionError(''); void deleteLessonResource(resource.id).then(() => reload()).catch(() => setActionError('The resource could not be deleted.')).finally(() => setBusyId(null)) }} />}</div></Card>
}

export function StudentLessonResources({ lessonId }: { lessonId: string }) {
  const loader = useCallback(() => listStudentLessonResources(lessonId), [lessonId])
  const { data, loading, error, reload } = useAsyncData(loader)
  return <Card className="mt-6 p-5 sm:p-7"><h2 className="font-semibold">Resources</h2><p className="mt-1 text-sm text-muted-foreground">Download the files shared for this classroom lesson.</p><div className="mt-5">{loading ? <p className="text-sm text-muted-foreground">Loading resources…</p> : error || !data ? <div><p className="text-sm text-destructive">Resources could not be loaded.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void reload()}>Try again</Button></div> : <ResourceRows resources={data} canDelete={false} busyId={null} />}</div></Card>
}
