import { createDownloadUrl, createUploadUrl, deleteObject, inspectObject } from './lib/b2.ts'
import { GatewayError } from './gateway/errors.ts'
import {
  createInternalGatewaySession,
  firstRow,
  requireBearerToken,
  type InternalGatewaySession,
} from './lib/internalGateway.ts'
import { corsHeaders, emptyResponse, errorResponse, jsonResponse } from './lib/responses.ts'
import {
  runDeleteStorageOperation,
  runFinalizeStorageOperation,
  StorageReconciliationRequiredError,
} from './lib/storageOperations.ts'
import {
  RequestValidationError,
  requireUuid,
  validateAssignmentResourceUpload,
  validateResourceRequest,
  validateSubmissionFileUpload,
  validateUploadIntent,
} from './lib/validation.ts'
import type { ResourceStorageRow, WorkerEnv } from './types.ts'

interface StorageWorkerDependencies {
  createGatewaySession: typeof createInternalGatewaySession
  createUploadUrl: typeof createUploadUrl
  createDownloadUrl: typeof createDownloadUrl
  inspectObject: typeof inspectObject
  deleteObject: typeof deleteObject
}

const defaultDependencies: StorageWorkerDependencies = {
  createGatewaySession: createInternalGatewaySession,
  createUploadUrl,
  createDownloadUrl,
  inspectObject,
  deleteObject,
}

async function jsonBody(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestValidationError('Content-Type must be application/json.')
  }
  return await request.json()
}

async function uploadIntent(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
) {
  const input = validateUploadIntent(await jsonBody(request))
  const rows = await gateway.execute<ResourceStorageRow[]>('prepare_lesson_resource_upload', {
    target_lesson_id: input.lessonId,
    original_file_name: input.fileName,
    expected_file_size_bytes: input.fileSize,
    content_type: input.mimeType,
    resource_kind: input.resourceKind,
    resource_title: input.title || null,
  })
  const resource = firstRow(rows)
  const signed = await dependencies.createUploadUrl(env, resource.storage_path, input.mimeType)
  return jsonResponse(request, env, {
    resourceId: resource.resource_id,
    uploadUrl: signed.uploadUrl,
    expiresAt: signed.expiresAt,
    requiredHeaders: signed.requiredHeaders,
  })
}

async function finalizeUpload(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
) {
  const resourceId = validateResourceRequest(await jsonBody(request))
  const result = await runFinalizeStorageOperation({
    getState: async () => firstRow(await gateway.execute<ResourceStorageRow[]>(
      'get_lesson_resource_upload_state', { target_resource_id: resourceId },
    )),
    inspectObject: async (storagePath) => await dependencies.inspectObject(env, storagePath),
    finalize: async (fileSize, etag) => await gateway.execute<null>('finalize_lesson_resource_upload', {
      target_resource_id: resourceId,
      verified_file_size_bytes: fileSize,
      verified_storage_etag: etag,
    }),
  })
  if (!result.sizeMatches) {
    return errorResponse(request, env, 409, 'The uploaded object size does not match the expected file.')
  }
  return jsonResponse(request, env, { resourceId, status: 'ready' })
}

async function downloadUrl(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
) {
  const resourceId = validateResourceRequest(await jsonBody(request))
  const rows = await gateway.execute<ResourceStorageRow[]>('authorize_lesson_resource_download', {
    target_resource_id: resourceId,
  })
  const resource = firstRow(rows)
  const signed = await dependencies.createDownloadUrl(env, resource.storage_path, resource.file_name ?? 'resource')
  return jsonResponse(request, env, { downloadUrl: signed.downloadUrl, expiresAt: signed.expiresAt })
}

async function removeResource(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
  resourceId: string,
) {
  const id = requireUuid(resourceId, 'Resource')
  await runDeleteStorageOperation({
    authorize: async () => firstRow(await gateway.execute<ResourceStorageRow[]>(
      'authorize_lesson_resource_delete', { target_resource_id: id },
    )),
    deleteObject: async (storagePath) => await dependencies.deleteObject(env, storagePath),
    deleteMetadata: async () => await gateway.execute<null>('delete_lesson_resource_metadata', {
      target_resource_id: id,
    }),
  })
  return emptyResponse(request, env)
}

async function createUploadIntent(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
  operation: string,
  params: Record<string, unknown>,
  idField: 'resource_id' | 'file_id',
) {
  const rows = await gateway.execute<ResourceStorageRow[]>(operation, params)
  const resource = firstRow(rows)
  const id = resource[idField]
  if (!id) throw new GatewayError('INTERNAL')
  const signed = await dependencies.createUploadUrl(env, resource.storage_path, String(params.content_type))
  return jsonResponse(request, env, {
    resourceId: id,
    uploadUrl: signed.uploadUrl,
    expiresAt: signed.expiresAt,
    requiredHeaders: signed.requiredHeaders,
  })
}

async function finalizeStoredFile(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
  stateOperation: string,
  finalizeOperation: string,
  idArgument: string,
) {
  const id = validateResourceRequest(await jsonBody(request))
  const rows = await gateway.execute<ResourceStorageRow[]>(stateOperation, { [idArgument]: id })
  const resource = firstRow(rows)
  const object = await dependencies.inspectObject(env, resource.storage_path)
  if (object.ContentLength == null || Number(object.ContentLength) !== Number(resource.file_size_bytes)) {
    return errorResponse(request, env, 409, 'The uploaded object size does not match the expected file.')
  }
  await gateway.execute<null>(finalizeOperation, {
    [idArgument]: id,
    verified_file_size_bytes: Number(object.ContentLength),
    verified_storage_etag: object.ETag ?? null,
  })
  return jsonResponse(request, env, { resourceId: id, status: 'ready' })
}

async function createStoredFileDownload(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
  operation: string,
  idArgument: string,
) {
  const id = validateResourceRequest(await jsonBody(request))
  const rows = await gateway.execute<ResourceStorageRow[]>(operation, { [idArgument]: id })
  const resource = firstRow(rows)
  const signed = await dependencies.createDownloadUrl(env, resource.storage_path, resource.file_name ?? 'resource')
  return jsonResponse(request, env, { downloadUrl: signed.downloadUrl, expiresAt: signed.expiresAt })
}

async function removeAssignmentResource(
  request: Request,
  env: WorkerEnv,
  gateway: InternalGatewaySession,
  dependencies: StorageWorkerDependencies,
  value: string,
) {
  const id = requireUuid(value, 'Resource')
  const rows = await gateway.execute<ResourceStorageRow[]>('authorize_assignment_resource_delete', {
    target_resource_id: id,
  })
  const resource = firstRow(rows)
  await dependencies.deleteObject(env, resource.storage_path)
  await gateway.execute<null>('delete_assignment_resource_metadata', { target_resource_id: id })
  return emptyResponse(request, env)
}

export function createStorageWorker(overrides: Partial<StorageWorkerDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }
  return {
    async fetch(request: Request, env: WorkerEnv) {
      const origin = request.headers.get('Origin')
      if (request.method === 'OPTIONS') {
        return origin === env.APP_ORIGIN
          ? emptyResponse(request, env)
          : new Response(null, { status: 403, headers: corsHeaders(request, env) })
      }
      if (origin && origin !== env.APP_ORIGIN) {
        return errorResponse(request, env, 403, 'Origin is not allowed.')
      }

      try {
        const token = requireBearerToken(request)
        const gateway = await dependencies.createGatewaySession(env, token)
        const url = new URL(request.url)
        if (request.method === 'POST' && url.pathname === '/v1/resources/upload-intent') {
          return await uploadIntent(request, env, gateway, dependencies)
        }
        if (request.method === 'POST' && url.pathname === '/v1/resources/finalize') {
          return await finalizeUpload(request, env, gateway, dependencies)
        }
        if (request.method === 'POST' && url.pathname === '/v1/resources/download-url') {
          return await downloadUrl(request, env, gateway, dependencies)
        }
        if (request.method === 'POST' && url.pathname === '/v1/assignment-resources/upload-intent') {
          const input = validateAssignmentResourceUpload(await jsonBody(request))
          return await createUploadIntent(request, env, gateway, dependencies, 'prepare_assignment_resource_upload', {
            target_assignment_id: input.assignmentId,
            original_file_name: input.fileName,
            expected_file_size_bytes: input.fileSize,
            content_type: input.mimeType,
            resource_kind: input.resourceKind,
            resource_title: input.title || null,
          }, 'resource_id')
        }
        if (request.method === 'POST' && url.pathname === '/v1/assignment-resources/finalize') {
          return await finalizeStoredFile(request, env, gateway, dependencies, 'get_assignment_resource_upload_state', 'finalize_assignment_resource_upload', 'target_resource_id')
        }
        if (request.method === 'POST' && url.pathname === '/v1/assignment-resources/download-url') {
          return await createStoredFileDownload(request, env, gateway, dependencies, 'authorize_assignment_resource_download', 'target_resource_id')
        }
        if (request.method === 'POST' && url.pathname === '/v1/submission-files/upload-intent') {
          const input = validateSubmissionFileUpload(await jsonBody(request))
          return await createUploadIntent(request, env, gateway, dependencies, 'prepare_submission_file_upload', {
            target_assignment_id: input.assignmentId,
            original_file_name: input.fileName,
            expected_file_size_bytes: input.fileSize,
            content_type: input.mimeType,
            resource_kind: input.resourceKind,
          }, 'file_id')
        }
        if (request.method === 'POST' && url.pathname === '/v1/submission-files/finalize') {
          return await finalizeStoredFile(request, env, gateway, dependencies, 'get_submission_file_upload_state', 'finalize_submission_file_upload', 'target_file_id')
        }
        if (request.method === 'POST' && url.pathname === '/v1/submission-files/download-url') {
          return await createStoredFileDownload(request, env, gateway, dependencies, 'authorize_submission_file_download', 'target_file_id')
        }
        const deleteMatch = url.pathname.match(/^\/v1\/resources\/([0-9a-f-]+)$/i)
        if (request.method === 'DELETE' && deleteMatch) {
          return await removeResource(request, env, gateway, dependencies, deleteMatch[1])
        }
        const assignmentDeleteMatch = url.pathname.match(/^\/v1\/assignment-resources\/([0-9a-f-]+)$/i)
        if (request.method === 'DELETE' && assignmentDeleteMatch) {
          return await removeAssignmentResource(request, env, gateway, dependencies, assignmentDeleteMatch[1])
        }
        return errorResponse(request, env, 404, 'Endpoint not found.')
      } catch (error) {
        if (error instanceof RequestValidationError) return errorResponse(request, env, 400, error.message)
        if (error instanceof StorageReconciliationRequiredError) {
          return errorResponse(request, env, error.status, error.message)
        }
        if (error instanceof GatewayError) return errorResponse(request, env, error.status, error.message)
        return errorResponse(request, env, 502, 'The storage operation could not be completed.')
      }
    },
  } satisfies ExportedHandler<WorkerEnv>
}

export default createStorageWorker()
