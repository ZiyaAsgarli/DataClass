import assert from 'node:assert/strict'
import test from 'node:test'
import {
  executeGatewayDatabase,
  GATEWAY_CONNECT_DEADLINE_MS,
  GATEWAY_IDLE_TRANSACTION_TIMEOUT_MS,
  GATEWAY_OVERALL_DEADLINE_MS,
  GATEWAY_STATEMENT_TIMEOUT_MS,
  type GatewayPgClient,
} from '../worker/gateway/database.ts'
import { GatewayError } from '../worker/gateway/errors.ts'
import { executeGatewayOperationInternal } from '../worker/gateway/execute.ts'
import { GATEWAY_MAX_BODY_BYTES, handleGatewayRequest } from '../worker/gateway/index.ts'
import { GATEWAY_OPERATION_REGISTRY, validateGatewayParameters } from '../worker/gateway/registry.ts'
import type { GatewayEnv } from '../worker/gateway/types.ts'

const ORIGIN = 'https://isolated-app.invalid'
const ACTOR_A = '10000000-0000-4000-8000-000000000001'
const ACTOR_B = '20000000-0000-4000-8000-000000000002'
const env: GatewayEnv = {
  GATEWAY_ENABLED: 'true', GATEWAY_APP_ORIGIN: ORIGIN,
  GATEWAY_NEON_JWT_ISSUER: 'https://isolated-auth.invalid',
  GATEWAY_NEON_JWT_AUDIENCE: 'https://isolated-auth.invalid',
  GATEWAY_NEON_JWKS_URL: 'https://isolated-auth.invalid/database/auth/.well-known/jwks.json',
  HYPERDRIVE: { connectionString: 'isolated-connection' },
}

function request(body: unknown, options: { origin?: string; bearer?: string; method?: string; size?: number } = {}) {
  const encoded = JSON.stringify(body)
  return new Request('https://isolated-gateway.invalid/rpc', {
    method: options.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${options.bearer ?? 'synthetic-token'}`,
      'Content-Type': 'application/json',
      Origin: options.origin ?? ORIGIN,
      ...(options.size === undefined ? {} : { 'Content-Length': String(options.size) }),
    },
    body: options.method === 'OPTIONS' ? undefined : encoded,
  })
}

const verify = async () => ({ actorId: ACTOR_A })

test('browser endpoint preserves data shape and exact-origin CORS', async () => {
  const observations: unknown[] = []
  const response = await handleGatewayRequest(
    request({ operation: 'list_my_student_classes', params: {} }), env,
    { verify, execute: async () => [{ id: 'class-a' }], observe: (event) => observations.push(event) },
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.deepEqual(await response.json(), { data: [{ id: 'class-a' }] })
  assert.equal(observations.length, 1)
  assert.doesNotMatch(JSON.stringify(observations), new RegExp(ACTOR_A))
})

test('OPTIONS and disallowed origins are deterministic', async () => {
  const options = await handleGatewayRequest(request({}, { method: 'OPTIONS' }), env)
  assert.equal(options.status, 204)
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  const denied = await handleGatewayRequest(request({}, { origin: 'https://wrong-origin.invalid' }), env)
  assert.equal(denied.status, 403)
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null)
})

test('auth, body, operation, and internal exposure fail closed before execution', async () => {
  let calls = 0
  const execute = async () => { calls += 1; return null }
  const missingAuth = request({ operation: 'list_my_student_classes', params: {} })
  missingAuth.headers.delete('Authorization')
  assert.equal((await handleGatewayRequest(missingAuth, env, { verify, execute })).status, 401)
  assert.equal((await handleGatewayRequest(request({ operation: 'unknown', params: {} }), env, { verify, execute })).status, 404)
  assert.equal((await handleGatewayRequest(request({
    operation: 'authorize_lesson_resource_download', params: { target_resource_id: ACTOR_A },
  }), env, { verify, execute })).status, 404)
  assert.equal((await handleGatewayRequest(request({
    operation: 'list_my_student_classes', params: { user_id: ACTOR_B },
  }), env, { verify, execute })).status, 400)
  assert.equal((await handleGatewayRequest(request({
    operation: 'list_my_student_classes', params: {}, sql: 'SELECT 1',
  }), env, { verify, execute })).status, 400)
  assert.equal((await handleGatewayRequest(request({}, { size: GATEWAY_MAX_BODY_BYTES + 1 }), env, { verify, execute })).status, 400)
  assert.equal(calls, 0)
})

test('internal invocation cannot execute browser operations', async () => {
  await assert.rejects(
    executeGatewayOperationInternal(env, ACTOR_A, 'list_my_student_classes', {}),
    (error: unknown) => error instanceof GatewayError && error.code === 'NOT_FOUND',
  )
})

type FailureStage = 'connect' | 'BEGIN' | 'actor' | 'operation' | 'COMMIT' | 'ROLLBACK' | 'end'

class GatewayClient implements GatewayPgClient {
  actor: string | null = null
  transaction = false
  operationCalls = 0
  rollbackCalls = 0
  endCalls = 0
  readonly failures: Set<FailureStage>
  private errorListener?: () => void

  constructor(...failures: FailureStage[]) { this.failures = new Set(failures) }
  onError(listener: () => void) { this.errorListener = listener }
  emitError() { this.errorListener?.() }
  async connect() { if (this.failures.has('connect')) throw Object.assign(new Error('private connect'), { code: '08006' }) }
  async query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) {
    let stage: FailureStage | null = null
    if (text === 'BEGIN') stage = 'BEGIN'
    else if (text.startsWith("SELECT set_config('app.verified_actor_id'")) stage = 'actor'
    else if (text.includes('"app_gateway"."list_my_student_classes"')) stage = 'operation'
    else if (text === 'COMMIT') stage = 'COMMIT'
    else if (text === 'ROLLBACK') stage = 'ROLLBACK'
    if (stage === 'operation') this.operationCalls += 1
    if (stage === 'ROLLBACK') this.rollbackCalls += 1
    if (stage && this.failures.has(stage)) throw Object.assign(new Error(`private ${stage}`), { code: '08006' })
    if (text === 'BEGIN') this.transaction = true
    if (text.startsWith("SELECT set_config('app.verified_actor_id'")) this.actor = String(values?.[0])
    if (text.includes('current_actor_id')) return { rows: [{ actor_id: this.actor } as Row] }
    if (stage === 'operation') return { rows: [{ id: this.actor } as Row] }
    if (text === 'COMMIT' || text === 'ROLLBACK') { this.transaction = false; this.actor = null }
    return { rows: [] as Row[] }
  }
  async end() { this.endCalls += 1; if (this.failures.has('end')) throw new Error('private end') }
}

function databaseCall(client: GatewayPgClient, actorId = ACTOR_A) {
  const definition = GATEWAY_OPERATION_REGISTRY.list_my_student_classes
  return executeGatewayDatabase({
    connectionString: env.HYPERDRIVE.connectionString,
    actorId,
    invocation: validateGatewayParameters(definition, {}),
    clientFactory: () => client,
    overallDeadlineMillis: 100,
    connectDeadlineMillis: 50,
  })
}

test('gateway deadlines are conservative and fixed', () => {
  assert.deepEqual({
    overall: GATEWAY_OVERALL_DEADLINE_MS,
    connect: GATEWAY_CONNECT_DEADLINE_MS,
    statement: GATEWAY_STATEMENT_TIMEOUT_MS,
    idleTransaction: GATEWAY_IDLE_TRANSACTION_TIMEOUT_MS,
  }, { overall: 15_000, connect: 5_000, statement: 8_000, idleTransaction: 12_000 })
})

test('connect, BEGIN, actor, query, COMMIT, rollback, and disposal failures are contained without replay', async () => {
  for (const stages of [
    ['connect'], ['BEGIN'], ['actor'], ['operation'], ['COMMIT'], ['operation', 'ROLLBACK'], ['end'],
  ] as FailureStage[][]) {
    const client = new GatewayClient(...stages)
    await assert.rejects(databaseCall(client), GatewayError)
    assert.ok(client.operationCalls <= 1)
    if (stages.includes('BEGIN') || stages.includes('connect')) assert.equal(client.rollbackCalls, 0)
  }
})

test('asynchronous client errors and concurrent origin failures remain bounded', async () => {
  const asyncError = new GatewayClient()
  const originalConnect = asyncError.connect.bind(asyncError)
  asyncError.connect = async () => { await originalConnect(); asyncError.emitError() }
  await assert.rejects(databaseCall(asyncError), GatewayError)
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => databaseCall(new GatewayClient('connect'))))
  assert.ok(results.every(({ status }) => status === 'rejected'))
})

test('alternating and concurrent actors never retain identity', async () => {
  const sequential: string[] = []
  for (const actor of [ACTOR_A, ACTOR_B, ACTOR_A, ACTOR_B]) {
    const client = new GatewayClient()
    const result = await databaseCall(client, actor) as Array<{ id: string }>
    sequential.push(result[0].id)
    assert.equal(client.actor, null)
  }
  assert.deepEqual(sequential, [ACTOR_A, ACTOR_B, ACTOR_A, ACTOR_B])
  const concurrent = await Promise.all([ACTOR_A, ACTOR_B, ACTOR_B, ACTOR_A].map(async (actor) => {
    const rows = await databaseCall(new GatewayClient(), actor) as Array<{ id: string }>
    return rows[0].id
  }))
  assert.deepEqual(concurrent, [ACTOR_A, ACTOR_B, ACTOR_B, ACTOR_A])
})
