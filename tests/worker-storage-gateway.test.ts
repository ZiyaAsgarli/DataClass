import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { GatewayError } from '../worker/gateway/errors.ts'
import { parseGatewayRequest } from '../worker/gateway/registry.ts'
import { GATEWAY_OPERATION_ROWS } from '../worker/gateway/registryData.ts'
import { createStorageWorker } from '../worker/index.ts'
import { createInternalGatewaySession } from '../worker/lib/internalGateway.ts'
import type { InternalGatewaySession } from '../worker/lib/internalGateway.ts'
import type { ResourceStorageRow, WorkerEnv } from '../worker/types.ts'

const appOrigin = 'https://app.example.com'
const id = '00000000-0000-4000-8000-000000000001'
const assignmentId = '00000000-0000-4000-8000-000000000002'
const lessonId = '00000000-0000-4000-8000-000000000003'
const actorId = '00000000-0000-4000-8000-000000000004'

const env: WorkerEnv = {
  APP_ORIGIN: appOrigin,
  B2_KEY_ID: 'test-only',
  B2_APPLICATION_KEY: 'test-only',
  B2_BUCKET_NAME: 'test-only',
  B2_S3_ENDPOINT: 'https://s3.example.backblazeb2.com',
  B2_REGION: 'test-only',
  GATEWAY_ENABLED: 'false',
  GATEWAY_APP_ORIGIN: appOrigin,
  GATEWAY_NEON_JWT_ISSUER: 'https://auth.example.com',
  GATEWAY_NEON_JWT_AUDIENCE: 'https://auth.example.com',
  GATEWAY_NEON_JWKS_URL: 'https://auth.example.com/.well-known/jwks.json',
  HYPERDRIVE: { connectionString: 'postgresql://test.invalid/test' },
}

interface Call {
  operation: string
  params: Readonly<Record<string, unknown>>
}

function row(operation: string): ResourceStorageRow[] | null {
  if (operation.startsWith('finalize_') || operation.startsWith('delete_')) return null
  return [{
    resource_id: id,
    file_id: id,
    storage_path: 'isolated/object.txt',
    file_name: 'object.txt',
    file_size_bytes: 4,
    mime_type: 'text/plain',
    upload_status: 'pending',
  }]
}

function request(path: string, method = 'POST', body?: unknown) {
  return new Request(`https://worker.example.com${path}`, {
    method,
    headers: {
      Origin: appOrigin,
      Authorization: 'Bearer opaque-test-token',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function harness(failures: Partial<Record<string, Error>> = {}) {
  const calls: Call[] = []
  const events: string[] = []
  const gateway: InternalGatewaySession = {
    execute: async <T>(operation: string, params: Readonly<Record<string, unknown>>) => {
      calls.push({ operation, params })
      events.push(`db:${operation}`)
      const failure = failures[operation]
      if (failure) throw failure
      return row(operation) as T
    },
  }
  const worker = createStorageWorker({
    createGatewaySession: async () => gateway,
    createUploadUrl: async (_env, storagePath, contentType) => {
      events.push('b2:sign-upload')
      return {
        uploadUrl: `https://upload.example.com/${storagePath}`,
        expiresAt: '2026-01-01T00:00:00.000Z',
        requiredHeaders: { 'Content-Type': contentType },
      }
    },
    createDownloadUrl: async (_env, storagePath) => {
      events.push('b2:sign-download')
      return { downloadUrl: `https://download.example.com/${storagePath}`, expiresAt: '2026-01-01T00:00:00.000Z' }
    },
    inspectObject: async () => {
      events.push('b2:head')
      const failure = failures['b2:head']
      if (failure) throw failure
      return { ContentLength: 4, ETag: 'test-etag' }
    },
    deleteObject: async () => {
      events.push('b2:delete')
      const failure = failures['b2:delete']
      if (failure) throw failure
    },
  })
  return { worker, calls, events }
}

test('all 16 storage database operations map exactly to Worker-internal registry entries', () => {
  const internal = GATEWAY_OPERATION_ROWS.filter(({ exposure }) => exposure === 'WORKER_INTERNAL')
  assert.equal(internal.length, 16)
  assert.equal(internal.filter(({ mutationClass }) => mutationClass === 'M4').length, 8)
  assert.equal(internal.filter(({ access }) => access === 'READ').length, 8)
  for (const definition of internal) {
    assert.throws(() => parseGatewayRequest({ operation: definition.key, params: {} }), GatewayError)
  }
})

test('all storage routes use the 16 exact internal operations with preserved parameters', async () => {
  const { worker, calls } = harness()
  const cases: Array<[Request, number]> = [
    [request('/v1/resources/upload-intent', 'POST', { lessonId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt', title: '' }), 200],
    [request('/v1/resources/finalize', 'POST', { resourceId: id }), 200],
    [request('/v1/resources/download-url', 'POST', { resourceId: id }), 200],
    [request(`/v1/resources/${id}`, 'DELETE'), 204],
    [request('/v1/assignment-resources/upload-intent', 'POST', { assignmentId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt', title: '' }), 200],
    [request('/v1/assignment-resources/finalize', 'POST', { resourceId: id }), 200],
    [request('/v1/assignment-resources/download-url', 'POST', { resourceId: id }), 200],
    [request(`/v1/assignment-resources/${id}`, 'DELETE'), 204],
    [request('/v1/submission-files/upload-intent', 'POST', { assignmentId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt' }), 200],
    [request('/v1/submission-files/finalize', 'POST', { resourceId: id }), 200],
    [request('/v1/submission-files/download-url', 'POST', { resourceId: id }), 200],
  ]
  for (const [input, expectedStatus] of cases) {
    assert.equal((await worker.fetch(input, env, {} as ExecutionContext)).status, expectedStatus)
  }
  assert.deepEqual(calls.map(({ operation }) => operation).sort(), GATEWAY_OPERATION_ROWS
    .filter(({ exposure }) => exposure === 'WORKER_INTERNAL')
    .map(({ key }) => key)
    .sort())
  assert.deepEqual(calls.find(({ operation }) => operation === 'prepare_lesson_resource_upload')?.params, {
    target_lesson_id: lessonId,
    original_file_name: 'object.txt',
    expected_file_size_bytes: 4,
    content_type: 'text/plain',
    resource_kind: 'txt',
    resource_title: null,
  })
  assert.deepEqual(calls.find(({ operation }) => operation === 'finalize_submission_file_upload')?.params, {
    target_file_id: id,
    verified_file_size_bytes: 4,
    verified_storage_etag: 'test-etag',
  })
})

test('internal session verifies once and invokes only the shared internal executor', async () => {
  const events: string[] = []
  const session = await createInternalGatewaySession(env, 'opaque-test-token', {
    verify: async () => { events.push('verify'); return { actorId } },
    execute: async (_env, actor, operation, params) => {
      events.push(`${actor}:${operation}:${Object.keys(params).length}`)
      return [{ resource_id: id }]
    },
  })
  await session.execute('authorize_lesson_resource_download', { target_resource_id: id })
  await session.execute('get_lesson_resource_upload_state', { target_resource_id: id })
  assert.deepEqual(events, [
    'verify',
    `${actorId}:authorize_lesson_resource_download:1`,
    `${actorId}:get_lesson_resource_upload_state:1`,
  ])
})

test('authorization and prepare failures stop before every B2 boundary', async () => {
  for (const [path, body, operation] of [
    ['/v1/resources/download-url', { resourceId: id }, 'authorize_lesson_resource_download'],
    ['/v1/resources/upload-intent', { lessonId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt' }, 'prepare_lesson_resource_upload'],
  ] as const) {
    const { worker, calls, events } = harness({ [operation]: new GatewayError('FORBIDDEN') })
    assert.equal((await worker.fetch(request(path, 'POST', body), env, {} as ExecutionContext)).status, 403)
    assert.equal(calls.length, 1)
    assert.equal(events.some((event) => event.startsWith('b2:')), false)
  }
})

test('upload signing never performs PUT or invokes finalize', async () => {
  const { worker, calls, events } = harness()
  const response = await worker.fetch(request('/v1/resources/upload-intent', 'POST', {
    lessonId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt',
  }), env, {} as ExecutionContext)
  assert.equal(response.status, 200)
  assert.deepEqual(calls.map(({ operation }) => operation), ['prepare_lesson_resource_upload'])
  assert.deepEqual(events, ['db:prepare_lesson_resource_upload', 'b2:sign-upload'])
})

test('B2 inspection failure prevents finalize and a finalize failure is never replayed', async () => {
  const failedHead = harness({ 'b2:head': new Error('isolated failure') })
  assert.equal((await failedHead.worker.fetch(request('/v1/resources/finalize', 'POST', { resourceId: id }), env, {} as ExecutionContext)).status, 502)
  assert.deepEqual(failedHead.calls.map(({ operation }) => operation), ['get_lesson_resource_upload_state'])

  const failedFinalize = harness({ finalize_lesson_resource_upload: new GatewayError('DATABASE_UNAVAILABLE') })
  const finalizeResponse = await failedFinalize.worker.fetch(request('/v1/resources/finalize', 'POST', { resourceId: id }), env, {} as ExecutionContext)
  assert.equal(finalizeResponse.status, 503)
  assert.deepEqual(await finalizeResponse.json(), {
    error: 'The storage state requires reconciliation before this operation can continue.',
  })
  assert.deepEqual(failedFinalize.calls.map(({ operation }) => operation), [
    'get_lesson_resource_upload_state',
    'finalize_lesson_resource_upload',
  ])
  assert.equal(failedFinalize.events.filter((event) => event === 'b2:head').length, 1)
})

test('delete failures preserve DB-before-B2 ordering and never replay either side', async () => {
  const failedDelete = harness({ 'b2:delete': new Error('isolated failure') })
  assert.equal((await failedDelete.worker.fetch(request(`/v1/resources/${id}`, 'DELETE'), env, {} as ExecutionContext)).status, 502)
  assert.deepEqual(failedDelete.events, ['db:authorize_lesson_resource_delete', 'b2:delete'])

  const failedMetadata = harness({ delete_lesson_resource_metadata: new GatewayError('DATABASE_UNAVAILABLE') })
  const metadataResponse = await failedMetadata.worker.fetch(request(`/v1/resources/${id}`, 'DELETE'), env, {} as ExecutionContext)
  assert.equal(metadataResponse.status, 503)
  assert.deepEqual(await metadataResponse.json(), {
    error: 'The storage state requires reconciliation before this operation can continue.',
  })
  assert.deepEqual(failedMetadata.events, [
    'db:authorize_lesson_resource_delete',
    'b2:delete',
    'db:delete_lesson_resource_metadata',
  ])
})

test('gateway unavailability and ambiguous commits receive one call with no Data API fallback', async () => {
  for (const operation of ['get_lesson_resource_upload_state', 'prepare_lesson_resource_upload']) {
    const { worker, calls, events } = harness({ [operation]: new GatewayError('DATABASE_UNAVAILABLE') })
    const input = operation.startsWith('get_')
      ? request('/v1/resources/finalize', 'POST', { resourceId: id })
      : request('/v1/resources/upload-intent', 'POST', { lessonId, fileName: 'object.txt', fileSize: 4, mimeType: 'text/plain', resourceKind: 'txt' })
    assert.equal((await worker.fetch(input, env, {} as ExecutionContext)).status, 503)
    assert.equal(calls.length, 1)
    assert.equal(events.some((event) => event.startsWith('b2:')), false)
  }
})

test('production Worker source has no Data API, retry, self-call, or byte-proxy path', async () => {
  const workerSource = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8')
  const gatewaySource = await readFile(new URL('../worker/lib/internalGateway.ts', import.meta.url), 'utf8')
  const storageSource = await readFile(new URL('../src/services/storageService.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(workerSource, /callNeonRpc|NEON_DATA_API_URL|retry|fallback/i)
  assert.doesNotMatch(gatewaySource, /fetch\(|NEON_DATA_API_URL|retry|fallback/i)
  assert.match(storageSource, /callGatewayRpc<unknown>/)
  assert.doesNotMatch(storageSource, /neonClient|\.rpc\(/)
  assert.doesNotMatch(workerSource, /GetObjectCommand|PutObjectCommand|request\.body.*B2|new Response\(.*body/s)
})
