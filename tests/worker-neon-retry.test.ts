import assert from 'node:assert/strict'
import test from 'node:test'
import {
  callNeonRpc,
  isReadOnlyIdentityRetryRpc,
  NEON_IDENTITY_RETRY_DELAY_MS,
  NeonAuthorizationError,
  READ_ONLY_IDENTITY_RETRY_RPC_NAMES,
  type NeonRetryDiagnostic,
} from '../worker/lib/neonAuth.ts'
import { runDeleteStorageOperation, runFinalizeStorageOperation } from '../worker/lib/storageOperations.ts'
import type { WorkerEnv } from '../worker/types.ts'

const env: WorkerEnv = {
  APP_ORIGIN: 'https://app.example.com',
  NEON_DATA_API_URL: 'https://example.apirest.example.com/neondb/rest/v1',
  B2_KEY_ID: 'test-only',
  B2_APPLICATION_KEY: 'test-only',
  B2_BUCKET_NAME: 'test-only',
  B2_S3_ENDPOINT: 'https://s3.example.backblazeb2.com',
  B2_REGION: 'test-only',
}

const bearer = 'opaque-test-bearer'
const identityFailure = () => new Response(JSON.stringify({
  code: '42501',
  message: 'Resource not found or access denied',
  details: null,
  hint: null,
}), { status: 403, headers: { 'Content-Type': 'application/json' } })

const successRows = () => new Response(JSON.stringify([{
  resource_id: '00000000-0000-4000-8000-000000000001',
  storage_path: 'safe/object',
  file_name: 'safe.txt',
  file_size_bytes: 4,
  mime_type: 'text/plain',
  upload_status: 'pending',
}]), { status: 200, headers: { 'Content-Type': 'application/json' } })

function rpcOptions(fetcher: typeof fetch, diagnostics: NeonRetryDiagnostic[] = []) {
  return {
    fetcher,
    wait: async (milliseconds: number) => {
      assert.equal(milliseconds, NEON_IDENTITY_RETRY_DELAY_MS)
    },
    log: (entry: NeonRetryDiagnostic) => diagnostics.push(entry),
  }
}

test('read-only retry allowlist contains exactly the eight approved RPCs', () => {
  assert.deepEqual([...READ_ONLY_IDENTITY_RETRY_RPC_NAMES].sort(), [
    'authorize_assignment_resource_delete',
    'authorize_assignment_resource_download',
    'authorize_lesson_resource_delete',
    'authorize_lesson_resource_download',
    'authorize_submission_file_download',
    'get_assignment_resource_upload_state',
    'get_lesson_resource_upload_state',
    'get_submission_file_upload_state',
  ])
})

test('read-only RPC succeeds with one Neon call', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return successRows() }
  await callNeonRpc(env, bearer, 'authorize_lesson_resource_download', {}, rpcOptions(fetcher))
  assert.equal(calls, 1)
})

test('allowlisted 403/42501 retries exactly once and succeeds', async () => {
  let calls = 0
  const diagnostics: NeonRetryDiagnostic[] = []
  const fetcher: typeof fetch = async () => {
    calls += 1
    return calls === 1 ? identityFailure() : successRows()
  }
  await callNeonRpc(env, bearer, 'authorize_lesson_resource_delete', {}, rpcOptions(fetcher, diagnostics))
  assert.equal(calls, 2)
  assert.equal(diagnostics.at(-1)?.retrySucceeded, true)
})

test('allowlisted 403/42501 returns final denial when retry fails', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return identityFailure() }
  await assert.rejects(
    callNeonRpc(env, bearer, 'get_lesson_resource_upload_state', {}, rpcOptions(fetcher)),
    (error: unknown) => error instanceof NeonAuthorizationError
      && error.status === 403
      && error.postgresCode === '42501',
  )
  assert.equal(calls, 2)
})

test('allowlisted non-42501 403 does not retry', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ code: 'PGRST301', message: 'Denied' }), { status: 403 })
  }
  await assert.rejects(callNeonRpc(env, bearer, 'authorize_lesson_resource_download', {}, rpcOptions(fetcher)))
  assert.equal(calls, 1)
})

test('Neon error fields stay internal while the public error remains generic', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    code: 'PGRST301',
    message: 'Safe upstream message',
    details: 'Safe upstream details',
    hint: 'Safe upstream hint',
  }), { status: 403 })
  await assert.rejects(
    callNeonRpc(env, bearer, 'authorize_lesson_resource_download', {}, rpcOptions(fetcher)),
    (error: unknown) => error instanceof NeonAuthorizationError
      && error.message === 'The requested resource is unavailable or access was denied.'
      && error.postgresCode === 'PGRST301'
      && error.neonMessage === 'Safe upstream message'
      && error.details === 'Safe upstream details'
      && error.hint === 'Safe upstream hint',
  )
})

test('allowlisted 401 does not retry', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return new Response(null, { status: 401 }) }
  await assert.rejects(callNeonRpc(env, bearer, 'authorize_lesson_resource_download', {}, rpcOptions(fetcher)))
  assert.equal(calls, 1)
})

test('allowlisted 500 does not retry', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return new Response(null, { status: 500 }) }
  await assert.rejects(callNeonRpc(env, bearer, 'authorize_lesson_resource_download', {}, rpcOptions(fetcher)))
  assert.equal(calls, 1)
})

for (const rpcName of [
  'prepare_lesson_resource_upload',
  'prepare_assignment_resource_upload',
  'prepare_submission_file_upload',
  'finalize_lesson_resource_upload',
  'finalize_assignment_resource_upload',
  'finalize_submission_file_upload',
  'delete_lesson_resource_metadata',
  'delete_assignment_resource_metadata',
]) {
  test(`${rpcName} never retries a 403/42501 mutation failure`, async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => { calls += 1; return identityFailure() }
    await assert.rejects(callNeonRpc(env, bearer, rpcName, {}, rpcOptions(fetcher)))
    assert.equal(calls, 1)
    assert.equal(isReadOnlyIdentityRetryRpc(rpcName), false)
  })
}

test('authorize-delete retry resolves before B2 delete and metadata mutation', async () => {
  const events: string[] = []
  let authorizationCalls = 0
  async function testCallNeonRpc<T>(
    workerEnv: WorkerEnv,
    token: string,
    functionName: string,
    body: Record<string, unknown>,
  ) {
    const fetcher: typeof fetch = async () => {
      events.push(`neon:${functionName}`)
      if (functionName === 'authorize_lesson_resource_delete' && authorizationCalls++ === 0) {
        return identityFailure()
      }
      if (functionName === 'authorize_lesson_resource_delete') return successRows()
      return new Response(null, { status: 204 })
    }
    return await callNeonRpc<T>(workerEnv, token, functionName, body, rpcOptions(fetcher))
  }
  await runDeleteStorageOperation({
    authorize: async () => {
      const rows = await testCallNeonRpc<Array<{ storage_path: string }>>(
        env, bearer, 'authorize_lesson_resource_delete', {},
      )
      return rows[0]
    },
    deleteObject: async () => { events.push('b2:delete') },
    deleteMetadata: async () => await testCallNeonRpc(
      env, bearer, 'delete_lesson_resource_metadata', {},
    ),
  })
  assert.deepEqual(events, [
    'neon:authorize_lesson_resource_delete',
    'neon:authorize_lesson_resource_delete',
    'b2:delete',
    'neon:delete_lesson_resource_metadata',
  ])
})

test('state retry resolves before one HeadObject and one finalize mutation', async () => {
  const events: string[] = []
  let stateCalls = 0
  async function testCallNeonRpc<T>(
    workerEnv: WorkerEnv,
    token: string,
    functionName: string,
    body: Record<string, unknown>,
  ) {
    const fetcher: typeof fetch = async () => {
      events.push(`neon:${functionName}`)
      if (functionName === 'get_lesson_resource_upload_state' && stateCalls++ === 0) {
        return identityFailure()
      }
      if (functionName === 'get_lesson_resource_upload_state') return successRows()
      return new Response(null, { status: 204 })
    }
    return await callNeonRpc<T>(workerEnv, token, functionName, body, rpcOptions(fetcher))
  }
  const result = await runFinalizeStorageOperation({
    getState: async () => {
      const rows = await testCallNeonRpc<Array<{ storage_path: string; file_size_bytes: number }>>(
        env, bearer, 'get_lesson_resource_upload_state', {},
      )
      return rows[0]
    },
    inspectObject: async () => { events.push('b2:head'); return { ContentLength: 4, ETag: 'etag' } },
    finalize: async () => await testCallNeonRpc(
      env, bearer, 'finalize_lesson_resource_upload', {},
    ),
  })
  assert.equal(result.sizeMatches, true)
  assert.deepEqual(events, [
    'neon:get_lesson_resource_upload_state',
    'neon:get_lesson_resource_upload_state',
    'b2:head',
    'neon:finalize_lesson_resource_upload',
  ])
})

test('both retry attempts use the exact same bearer', async () => {
  const authorizations: string[] = []
  const fetcher: typeof fetch = async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('Authorization') ?? '')
    return authorizations.length === 1 ? identityFailure() : successRows()
  }
  await callNeonRpc(env, bearer, 'get_assignment_resource_upload_state', {}, rpcOptions(fetcher))
  assert.equal(authorizations.length, 2)
  assert.equal(authorizations[0], authorizations[1])
})

test('retryable invocation never exceeds two Neon calls', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls += 1; return identityFailure() }
  await assert.rejects(callNeonRpc(env, bearer, 'get_submission_file_upload_state', {}, rpcOptions(fetcher)))
  assert.equal(calls, 2)
})
