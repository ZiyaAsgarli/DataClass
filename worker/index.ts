import { createDownloadUrl, createUploadUrl, deleteObject, inspectObject } from './lib/b2'
import { callNeonRpc, firstRow, NeonAuthorizationError, requireBearerToken } from './lib/neonAuth'
import { corsHeaders, emptyResponse, errorResponse, jsonResponse } from './lib/responses'
import { RequestValidationError, requireUuid, validateResourceRequest, validateUploadIntent } from './lib/validation'
import type { ResourceStorageRow, WorkerEnv } from './types'

async function jsonBody(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestValidationError('Content-Type must be application/json.')
  }
  return await request.json()
}

async function uploadIntent(request: Request, env: WorkerEnv, token: string) {
  const input = validateUploadIntent(await jsonBody(request))
  const rows = await callNeonRpc<ResourceStorageRow[]>(env, token, 'prepare_lesson_resource_upload', {
    target_lesson_id: input.lessonId,
    original_file_name: input.fileName,
    expected_file_size_bytes: input.fileSize,
    content_type: input.mimeType,
    resource_kind: input.resourceKind,
    resource_title: input.title || null,
  })
  const resource = firstRow(rows)
  const signed = await createUploadUrl(env, resource.storage_path, input.mimeType)
  return jsonResponse(request, env, {
    resourceId: resource.resource_id,
    uploadUrl: signed.uploadUrl,
    expiresAt: signed.expiresAt,
    requiredHeaders: signed.requiredHeaders,
  })
}

async function finalizeUpload(request: Request, env: WorkerEnv, token: string) {
  const resourceId = validateResourceRequest(await jsonBody(request))
  const rows = await callNeonRpc<ResourceStorageRow[]>(env, token, 'get_lesson_resource_upload_state', {
    target_resource_id: resourceId,
  })
  const resource = firstRow(rows)
  const object = await inspectObject(env, resource.storage_path)
  if (object.ContentLength == null || Number(object.ContentLength) !== Number(resource.file_size_bytes)) {
    return errorResponse(request, env, 409, 'The uploaded object size does not match the expected file.')
  }
  await callNeonRpc<null>(env, token, 'finalize_lesson_resource_upload', {
    target_resource_id: resourceId,
    verified_file_size_bytes: Number(object.ContentLength),
    verified_storage_etag: object.ETag ?? null,
  })
  return jsonResponse(request, env, { resourceId, status: 'ready' })
}

async function downloadUrl(request: Request, env: WorkerEnv, token: string) {
  const resourceId = validateResourceRequest(await jsonBody(request))
  const rows = await callNeonRpc<ResourceStorageRow[]>(env, token, 'authorize_lesson_resource_download', {
    target_resource_id: resourceId,
  })
  const resource = firstRow(rows)
  const signed = await createDownloadUrl(env, resource.storage_path, resource.file_name ?? 'resource')
  return jsonResponse(request, env, { downloadUrl: signed.downloadUrl, expiresAt: signed.expiresAt })
}

async function removeResource(request: Request, env: WorkerEnv, token: string, resourceId: string) {
  const id = requireUuid(resourceId, 'Resource')
  const rows = await callNeonRpc<ResourceStorageRow[]>(env, token, 'authorize_lesson_resource_delete', {
    target_resource_id: id,
  })
  const resource = firstRow(rows)
  await deleteObject(env, resource.storage_path)
  await callNeonRpc<null>(env, token, 'delete_lesson_resource_metadata', {
    target_resource_id: id,
  })
  return emptyResponse(request, env)
}

export default {
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
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/v1/resources/upload-intent') {
        return await uploadIntent(request, env, token)
      }
      if (request.method === 'POST' && url.pathname === '/v1/resources/finalize') {
        return await finalizeUpload(request, env, token)
      }
      if (request.method === 'POST' && url.pathname === '/v1/resources/download-url') {
        return await downloadUrl(request, env, token)
      }
      const deleteMatch = url.pathname.match(/^\/v1\/resources\/([0-9a-f-]+)$/i)
      if (request.method === 'DELETE' && deleteMatch) {
        return await removeResource(request, env, token, deleteMatch[1])
      }
      return errorResponse(request, env, 404, 'Endpoint not found.')
    } catch (error) {
      if (error instanceof RequestValidationError) return errorResponse(request, env, 400, error.message)
      if (error instanceof NeonAuthorizationError) return errorResponse(request, env, error.status, error.message)
      return errorResponse(request, env, 502, 'The storage operation could not be completed.')
    }
  },
} satisfies ExportedHandler<WorkerEnv>
