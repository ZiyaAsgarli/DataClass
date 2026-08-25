export const MAX_RESOURCE_BYTES = 500 * 1024 * 1024

export const allowedResourceKinds = new Set([
  'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pdf', 'pbix', 'pbit',
  'sql', 'ipynb', 'py', 'txt', 'json', 'parquet', 'zip', 'docx', 'pptx',
])

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class RequestValidationError extends Error {}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function requireUuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new RequestValidationError(`${label} is invalid.`)
  }
  return value
}

function fileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

function validateFileInput(body: Record<string, unknown>) {
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : Number.NaN
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : ''
  const resourceKind = typeof body.resourceKind === 'string' ? body.resourceKind.trim().toLowerCase() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const extension = fileExtension(fileName)

  if (!fileName || fileName.length > 180 || /[/\\]|\.\./.test(fileName) || hasControlCharacters(fileName) || fileName.startsWith('.')) {
    throw new RequestValidationError('File name is invalid.')
  }
  if (!allowedResourceKinds.has(extension) || resourceKind !== extension) {
    throw new RequestValidationError('This file type is not supported.')
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_RESOURCE_BYTES) {
    throw new RequestValidationError('File size must be between 1 byte and 500 MiB.')
  }
  if (!mimeType || mimeType.length > 255 || hasControlCharacters(mimeType)) {
    throw new RequestValidationError('Content type is invalid.')
  }
  if (title.length > 160) {
    throw new RequestValidationError('Resource title must not exceed 160 characters.')
  }
  return { fileName, fileSize, mimeType, resourceKind, title }
}

function requireObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('Upload details are required.')
  }
  return value as Record<string, unknown>
}

export function validateUploadIntent(value: unknown) {
  const body = requireObject(value)
  const lessonId = requireUuid(body.lessonId, 'Lesson')
  return { lessonId, ...validateFileInput(body) }
}

export function validateAssignmentResourceUpload(value: unknown) {
  const body = requireObject(value)
  const assignmentId = requireUuid(body.assignmentId, 'Assignment')
  return { assignmentId, ...validateFileInput(body) }
}

export function validateSubmissionFileUpload(value: unknown) {
  const body = requireObject(value)
  const assignmentId = requireUuid(body.assignmentId, 'Assignment')
  return { assignmentId, ...validateFileInput(body) }
}

export function validateResourceRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('Resource details are required.')
  }
  return requireUuid((value as Record<string, unknown>).resourceId, 'Resource')
}
