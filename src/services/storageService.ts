import { getCurrentNeonAuthToken, neonClient } from '@/lib/neon'
import type { LessonResourceRecord } from '@/types'

type RpcRow = Record<string, unknown>

const storageApiUrl = (import.meta.env.VITE_STORAGE_API_URL || 'http://localhost:8787').replace(/\/+$/, '')
export const MAX_RESOURCE_BYTES = 500 * 1024 * 1024
export const allowedResourceExtensions = new Set([
  'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pdf', 'pbix', 'pbit',
  'sql', 'ipynb', 'py', 'txt', 'json', 'parquet', 'zip', 'docx', 'pptx',
])

function text(value: unknown) { return typeof value === 'string' ? value : '' }
function count(value: unknown) { return Number(value ?? 0) }
function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function mapResource(row: RpcRow): LessonResourceRecord {
  return {
    id: text(row.id),
    title: text(row.title),
    resourceKind: text(row.resource_kind),
    fileName: text(row.file_name),
    fileSizeBytes: count(row.file_size_bytes),
    mimeType: text(row.mime_type),
    position: count(row.resource_position),
    uploadedAt: text(row.uploaded_at),
    canManage: typeof row.can_manage === 'boolean' ? row.can_manage : undefined,
  }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const result = await neonClient.rpc(name, args)
  if (result.error) throw result.error
  return (Array.isArray(result.data) ? result.data : []) as RpcRow[]
}

export function resourceExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

export function validateResourceFile(file: File) {
  const extension = resourceExtension(file.name)
  if (!file.name || file.name.length > 180 || /[/\\]|\.\./.test(file.name) || hasControlCharacters(file.name) || file.name.startsWith('.')) {
    return 'Choose a file with a safe file name.'
  }
  if (!allowedResourceExtensions.has(extension)) return 'This file type is not supported.'
  if (file.size <= 0) return 'Empty files cannot be uploaded.'
  if (file.size > MAX_RESOURCE_BYTES) return 'Files must be 500 MiB or smaller.'
  return null
}

async function workerRequest<T>(path: string, init: RequestInit) {
  const token = await getCurrentNeonAuthToken()
  if (!token) throw new Error('Your authenticated session is not ready.')
  const response = await fetch(`${storageApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || 'The storage operation could not be completed.')
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export async function listTeacherLessonResources(lessonId: string) {
  return (await rpc('list_teacher_lesson_resources', { target_lesson_id: lessonId })).map(mapResource)
}

export async function listStudentLessonResources(lessonId: string) {
  return (await rpc('list_student_lesson_resources', { target_lesson_id: lessonId })).map(mapResource)
}

interface UploadIntent {
  resourceId: string
  uploadUrl: string
  expiresAt: string
  requiredHeaders: Record<string, string>
}

function putFile(upload: UploadIntent, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', upload.uploadUrl)
    Object.entries(upload.requiredHeaders).forEach(([name, value]) => request.setRequestHeader(name, value))
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error('Backblaze rejected the file upload.'))
    })
    request.addEventListener('error', () => reject(new Error('The direct file upload failed.')))
    request.addEventListener('abort', () => reject(new Error('The file upload was cancelled.')))
    request.send(file)
  })
}

export async function uploadLessonResource(lessonId: string, file: File, onProgress: (percent: number) => void) {
  const validationError = validateResourceFile(file)
  if (validationError) throw new Error(validationError)
  const kind = resourceExtension(file.name)
  const intent = await workerRequest<UploadIntent>('/v1/resources/upload-intent', {
    method: 'POST',
    body: JSON.stringify({
      lessonId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      resourceKind: kind,
      title: file.name,
    }),
  })
  await putFile(intent, file, onProgress)
  await workerRequest<{ resourceId: string; status: 'ready' }>('/v1/resources/finalize', {
    method: 'POST',
    body: JSON.stringify({ resourceId: intent.resourceId }),
  })
  return intent.resourceId
}

export async function getLessonResourceDownloadUrl(resourceId: string) {
  return await workerRequest<{ downloadUrl: string; expiresAt: string }>('/v1/resources/download-url', {
    method: 'POST',
    body: JSON.stringify({ resourceId }),
  })
}

export async function deleteLessonResource(resourceId: string) {
  await workerRequest<void>(`/v1/resources/${resourceId}`, { method: 'DELETE' })
}
