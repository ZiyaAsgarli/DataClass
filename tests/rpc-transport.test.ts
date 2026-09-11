import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createGatewayRpcCaller,
  FRONTEND_GATEWAY_TIMEOUT_MS,
  GatewayRpcError,
  type GatewayRpcErrorCode,
} from '../src/lib/rpc.ts'

const gatewayUrl = 'https://gateway.invalid'
const token = 'sdk-derived-session-jwt'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function caller(fetcher: typeof fetch, getToken = async () => token, timeoutMs = FRONTEND_GATEWAY_TIMEOUT_MS) {
  return createGatewayRpcCaller({ gatewayUrl, getToken, fetcher, timeoutMs })
}

async function expectCode(promise: Promise<unknown>, code: GatewayRpcErrorCode) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof GatewayRpcError)
    assert.equal(error.code, code)
    return true
  })
}

test('valid SDK session returns the gateway data contract', async () => {
  const rows = [{ id: 'synthetic-class', student_count: 1 }]
  const result = await caller(async () => json({ data: rows }))<typeof rows>('list_my_student_classes')
  assert.deepEqual(result, rows)
})

test('missing SDK session JWT fails before fetch', async () => {
  let calls = 0
  const call = caller(async () => { calls += 1; return json({ data: [] }) }, async () => null)
  await expectCode(call('list_my_student_classes'), 'AUTH_REQUIRED')
  assert.equal(calls, 0)
})

for (const [status, code] of [
  [401, 'AUTH_REQUIRED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
  [409, 'CONFLICT'],
  [400, 'VALIDATION'],
  [503, 'DATABASE_UNAVAILABLE'],
] as const) {
  test(`gateway ${status} maps to ${code}`, async () => {
    const call = caller(async () => json({ error: { code, message: 'ignored server detail' } }, status))
    await expectCode(call('list_my_student_classes'), code)
  })
}

test('malformed JSON response maps to INTERNAL', async () => {
  const call = caller(async () => new Response('<html>', { status: 502 }))
  await expectCode(call('list_my_student_classes'), 'INTERNAL')
})

test('network failure maps to DATABASE_UNAVAILABLE', async () => {
  const call = caller(async () => { throw new TypeError('network detail') })
  await expectCode(call('list_my_student_classes'), 'DATABASE_UNAVAILABLE')
})

test('timeout aborts fetch and maps to DATABASE_UNAVAILABLE', async () => {
  let aborted = false
  const fetcher: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
  const call = caller(fetcher, async () => token, 5)
  await expectCode(call('list_my_student_classes'), 'DATABASE_UNAVAILABLE')
  assert.equal(aborted, true)
})

test('transport never retries a failed request', async () => {
  let calls = 0
  const call = caller(async () => { calls += 1; return json({ error: { code: 'DATABASE_UNAVAILABLE' } }, 503) })
  await expectCode(call('list_my_student_classes'), 'DATABASE_UNAVAILABLE')
  assert.equal(calls, 1)
})

test('bearer header uses only the SDK-derived session token', async () => {
  let authorization: string | null = null
  const call = caller(async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization')
    return json({ data: [] })
  })
  await call('list_my_student_classes')
  assert.equal(authorization, `Bearer ${token}`)
})

test('canary request contains no caller identity or unexpected parameters', async () => {
  let requestBody: unknown
  const call = caller(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as unknown
    return json({ data: [] })
  })
  await call('list_my_student_classes')
  assert.deepEqual(requestBody, { operation: 'list_my_student_classes', params: {} })
})

test('transport does not fall back to another implementation', async () => {
  let calls = 0
  const call = caller(async () => { calls += 1; throw new Error('gateway unavailable') })
  await expectCode(call('list_my_student_classes'), 'DATABASE_UNAVAILABLE')
  assert.equal(calls, 1)
})

test('classService delegates gateway reads through the shared transport', () => {
  const source = readFileSync(new URL('../src/services/classService.ts', import.meta.url), 'utf8')
  assert.equal(source.match(/callGatewayRpc</g)?.length, 1)
  assert.match(source, /gatewayRpc<T extends RpcRow>[\s\S]*callGatewayRpc<unknown>/)
  assert.match(source, /listStudentClasses[\s\S]*gatewayRpc\('list_my_student_classes'\)/)
})

test('storage metadata reads delegate through the shared gateway transport', () => {
  const source = readFileSync(new URL('../src/services/storageService.ts', import.meta.url), 'utf8')
  assert.match(source, /callGatewayRpc<unknown>/)
  assert.doesNotMatch(source, /neonClient|\.rpc\(/)
})
