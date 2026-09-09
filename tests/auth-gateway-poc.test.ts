import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from 'jose'
import {
  executePocOperation,
  PocDatabaseUnavailableError,
  type PocPgClient,
} from '../worker/poc/database.ts'
import { handlePocGateway, type PocWorkerEnv } from '../worker/poc/index.ts'
import {
  POC_OPERATION_NAMES,
  POC_OPERATION_REGISTRY,
  parsePocOperationRequest,
} from '../worker/poc/registry.ts'
import {
  normalizeJwksUrl,
  PocAuthenticationError,
  verifyNeonJwt,
} from '../worker/poc/verifyNeonJwt.ts'

const ISSUER = 'https://auth.poc.invalid'
const AUDIENCE = ISSUER
const JWKS_URL = 'https://auth.poc.invalid/database/auth/.well-known/jwks.json'
const APP_ORIGIN = 'https://app.poc.invalid'
const USER_A = '10000000-0000-4000-8000-000000000001'
const USER_B = '20000000-0000-4000-8000-000000000002'

const primaryKeys = await generateKeyPair('EdDSA')
const otherKeys = await generateKeyPair('EdDSA')
const publicJwk = await exportJWK(primaryKeys.publicKey)
publicJwk.alg = 'EdDSA'
publicJwk.kid = 'poc-primary'
const localKeySet = createLocalJWKSet({ keys: [publicJwk] })

const env: PocWorkerEnv = {
  POC_AUTH_GATEWAY_ENABLED: 'true',
  POC_APP_ORIGIN: APP_ORIGIN,
  POC_NEON_JWT_ISSUER: ISSUER,
  POC_NEON_JWT_AUDIENCE: AUDIENCE,
  POC_NEON_JWKS_URL: JWKS_URL,
  HYPERDRIVE: { connectionString: 'isolated-test-connection' },
}

interface TokenOptions {
  subject?: string
  issuer?: string
  audience?: string
  expiresIn?: number
  notBefore?: number
  privateKey?: CryptoKey
}

async function token(options: TokenOptions = {}) {
  const now = Math.floor(Date.now() / 1000)
  let builder = new SignJWT({ scope: 'poc' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'poc-primary' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (options.expiresIn ?? 300))
  if (options.subject !== '') builder = builder.setSubject(options.subject ?? USER_A)
  if (options.notBefore !== undefined) builder = builder.setNotBefore(now + options.notBefore)
  return await builder.sign(options.privateKey ?? primaryKeys.privateKey)
}

function request(bearer: string, body: unknown) {
  return new Request('https://gateway.poc.invalid/internal-poc/rpc', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Origin: APP_ORIGIN,
    },
    body: JSON.stringify(body),
  })
}

function verifier(keySet: JWTVerifyGetKey = localKeySet) {
  return (bearer: string, config: { issuer: string; audience: string; jwksUrl: string }) => (
    verifyNeonJwt(bearer, config, { keySet })
  )
}

class ReusedPocClient implements PocPgClient {
  transactionOpen = false
  actor: string | null = null
  failNextOperation = false
  operationActors: string[] = []

  async connect() {}

  async query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) {
    if (text === 'BEGIN') {
      assert.equal(this.transactionOpen, false)
      this.transactionOpen = true
      return { rows: [] as Row[] }
    }
    if (text.startsWith('SET LOCAL statement_timeout = ')
      || text.startsWith('SET LOCAL idle_in_transaction_session_timeout = ')) {
      assert.equal(this.transactionOpen, true)
      return { rows: [] as Row[] }
    }
    if (text.startsWith("SELECT set_config('app.verified_actor_id'")) {
      assert.equal(this.transactionOpen, true)
      this.actor = String(values?.[0] ?? '')
      return { rows: [] as Row[] }
    }
    if (text === 'SELECT app_private.current_actor_id()::text AS actor_id') {
      return { rows: [{ actor_id: this.transactionOpen ? this.actor : null } as Row] }
    }
    if (text === 'SELECT * FROM app_poc.list_my_student_classes()') {
      assert.equal(this.transactionOpen, true)
      if (this.failNextOperation) {
        this.failNextOperation = false
        throw new Error('synthetic operation failure')
      }
      assert.ok(this.actor)
      this.operationActors.push(this.actor)
      return { rows: [{ visible_for: this.actor } as Row] }
    }
    if (text === 'COMMIT' || text === 'ROLLBACK') {
      this.transactionOpen = false
      this.actor = null
      return { rows: [] as Row[] }
    }
    throw new Error(`Unexpected fixed query: ${text}`)
  }

  async end() {}
}

async function executeWith(client: ReusedPocClient, actorId: string) {
  return await executePocOperation({
    connectionString: env.HYPERDRIVE.connectionString,
    actorId,
    operation: 'list_my_student_classes',
    clientFactory: () => client,
  })
}

test('valid users A and B resolve only their verified actor results', async () => {
  const client = new ReusedPocClient()
  const execute = async (_env: PocWorkerEnv, actorId: string) => executeWith(client, actorId)

  const responseA = await handlePocGateway(
    request(await token({ subject: USER_A }), { operation: 'list_my_student_classes', params: {} }),
    env,
    { verify: verifier(), execute },
  )
  const responseB = await handlePocGateway(
    request(await token({ subject: USER_B }), { operation: 'list_my_student_classes', params: {} }),
    env,
    { verify: verifier(), execute },
  )

  assert.equal(responseA.status, 200)
  assert.equal(responseB.status, 200)
  assert.deepEqual(client.operationActors, [USER_A, USER_B])
})

test('A then B and B then A never retain the previous actor on a reused client', async () => {
  const client = new ReusedPocClient()
  await executeWith(client, USER_A)
  assert.equal(client.actor, null)
  await executeWith(client, USER_B)
  assert.equal(client.actor, null)
  await executeWith(client, USER_B)
  assert.equal(client.actor, null)
  await executeWith(client, USER_A)
  assert.equal(client.actor, null)
  assert.deepEqual(client.operationActors, [USER_A, USER_B, USER_B, USER_A])
})

test('invalid signature is rejected before database execution', async () => {
  let databaseCalls = 0
  const response = await handlePocGateway(
    request(await token({ privateKey: otherKeys.privateKey }), { operation: 'list_my_student_classes', params: {} }),
    env,
    { verify: verifier(), execute: async () => { databaseCalls += 1; return [] } },
  )
  assert.equal(response.status, 401)
  assert.equal(databaseCalls, 0)
})

test('expired, not-yet-valid, wrong-issuer, wrong-audience, missing-sub, and malformed-sub tokens fail closed', async () => {
  const candidates = [
    await token({ expiresIn: -60 }),
    await token({ notBefore: 60 }),
    await token({ issuer: 'https://wrong-issuer.poc.invalid' }),
    await token({ audience: 'https://wrong-audience.poc.invalid' }),
    await token({ subject: '' }),
    await token({ subject: 'not-a-uuid' }),
  ]
  for (const candidate of candidates) {
    await assert.rejects(
      verifyNeonJwt(candidate, { issuer: ISSUER, audience: AUDIENCE, jwksUrl: JWKS_URL }, { keySet: localKeySet }),
      PocAuthenticationError,
    )
  }
})

test('alg none is rejected without consulting a token-provided key URL', async () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'none', jku: 'https://attacker.invalid/jwks' })}.${encode({
    iss: ISSUER, aud: AUDIENCE, sub: USER_A, exp: Math.floor(Date.now() / 1000) + 300,
  })}.`
  await assert.rejects(
    verifyNeonJwt(unsigned, { issuer: ISSUER, audience: AUDIENCE, jwksUrl: JWKS_URL }, { keySet: localKeySet }),
    PocAuthenticationError,
  )
})

test('JWKS location is fixed HTTPS server configuration', () => {
  assert.equal(normalizeJwksUrl(JWKS_URL).toString(), JWKS_URL)
  const credentialedUrl = new URL(JWKS_URL)
  credentialedUrl.username = 'user'
  credentialedUrl.password = 'password'
  for (const candidate of [
    'http://auth.poc.invalid/database/auth/.well-known/jwks.json',
    credentialedUrl.toString(),
    'https://auth.poc.invalid/database/auth/.well-known/jwks.json?from=token',
  ]) {
    assert.throws(() => normalizeJwksUrl(candidate), PocAuthenticationError)
  }
})

test('browser-supplied user identity is rejected and never reaches the database', async () => {
  let databaseCalls = 0
  const response = await handlePocGateway(
    request(await token({ subject: USER_B }), {
      operation: 'list_my_student_classes', params: { user_id: USER_A },
    }),
    env,
    { verify: verifier(), execute: async () => { databaseCalls += 1; return [] } },
  )
  assert.equal(response.status, 400)
  assert.equal(databaseCalls, 0)
})

test('unknown and injection-like operations cannot become SQL identifiers', async () => {
  assert.deepEqual([...POC_OPERATION_NAMES], ['list_my_student_classes'])
  assert.deepEqual(Object.keys(POC_OPERATION_REGISTRY), ['list_my_student_classes'])
  for (const operation of ['unknown_operation', 'list_my_student_classes(); DROP TABLE public.classes;--']) {
    assert.throws(() => parsePocOperationRequest({ operation, params: {} }))
  }
  assert.throws(() => parsePocOperationRequest({
    operation: 'list_my_student_classes', params: { filter: "' OR true;--" },
  }))
})

test('transaction rollback clears actor state before the next user', async () => {
  const client = new ReusedPocClient()
  client.failNextOperation = true
  await assert.rejects(executeWith(client, USER_A), PocDatabaseUnavailableError)
  assert.equal(client.actor, null)
  assert.equal(client.transactionOpen, false)
  await executeWith(client, USER_B)
  assert.deepEqual(client.operationActors, [USER_B])
})

const DATABASE_UNAVAILABLE_BODY = {
  error: {
    code: 'GATEWAY_DATABASE_UNAVAILABLE',
    message: 'The service is temporarily unavailable.',
  },
}

async function gatewayWithClient(client: PocPgClient, subject = USER_A) {
  return await handlePocGateway(
    request(await token({ subject }), { operation: 'list_my_student_classes', params: {} }),
    env,
    {
      verify: verifier(),
      execute: async (_env, actorId) => executePocOperation({
        connectionString: env.HYPERDRIVE.connectionString,
        actorId,
        operation: 'list_my_student_classes',
        clientFactory: () => client,
      }),
    },
  )
}

async function assertDatabaseUnavailable(response: Response) {
  assert.equal(response.status, 503)
  assert.match(response.headers.get('Content-Type') ?? '', /^application\/json/)
  assert.deepEqual(await response.json(), DATABASE_UNAVAILABLE_BODY)
}

type FailureStage = 'connect' | 'BEGIN' | 'actor' | 'operation' | 'COMMIT' | 'ROLLBACK' | 'end'

class FailurePocClient extends ReusedPocClient {
  readonly failStages: Set<FailureStage>
  rollbackCalls = 0
  operationCalls = 0
  endCalls = 0
  private errorListener: (() => void) | undefined

  constructor(...failStages: FailureStage[]) {
    super()
    this.failStages = new Set(failStages)
  }

  onError(listener: () => void) {
    this.errorListener = listener
  }

  emitConnectionError() {
    this.errorListener?.()
  }

  override async connect() {
    if (this.failStages.has('connect')) throw new Error('synthetic connect detail')
  }

  override async query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) {
    let stage: FailureStage | undefined
    if (text === 'BEGIN') stage = 'BEGIN'
    else if (text.startsWith("SELECT set_config('app.verified_actor_id'")) stage = 'actor'
    else if (text === 'SELECT * FROM app_poc.list_my_student_classes()') {
      stage = 'operation'
      this.operationCalls += 1
    } else if (text === 'COMMIT') stage = 'COMMIT'
    else if (text === 'ROLLBACK') {
      stage = 'ROLLBACK'
      this.rollbackCalls += 1
    }
    if (stage && this.failStages.has(stage)) throw new Error(`synthetic ${stage} detail`)
    return await super.query<Row>(text, values)
  }

  override async end() {
    this.endCalls += 1
    if (this.failStages.has('end')) throw new Error('synthetic cleanup detail')
  }
}

test('connect failure is sanitized without rollback or a second socket close', async () => {
  let endCalls = 0
  const failingClient: PocPgClient = {
    connect: async () => { throw new Error('synthetic connection failure') },
    query: async () => ({ rows: [] }),
    end: async () => { endCalls += 1 },
  }
  const response = await gatewayWithClient(failingClient)
  await assertDatabaseUnavailable(response)
  assert.equal(endCalls, 0)
})

test('BEGIN failure is sanitized without attempting rollback', async () => {
  const client = new FailurePocClient('BEGIN')
  await assertDatabaseUnavailable(await gatewayWithClient(client))
  assert.equal(client.rollbackCalls, 0)
  assert.equal(client.endCalls, 1)
})

test('actor and operation query failures roll back and are sanitized', async () => {
  for (const stage of ['actor', 'operation'] as const) {
    const client = new FailurePocClient(stage)
    await assertDatabaseUnavailable(await gatewayWithClient(client))
    assert.equal(client.rollbackCalls, 1)
    assert.equal(client.endCalls, 1)
  }
})

test('COMMIT failure is not replayed and is sanitized', async () => {
  const client = new FailurePocClient('COMMIT')
  await assertDatabaseUnavailable(await gatewayWithClient(client))
  assert.equal(client.operationCalls, 1)
  assert.equal(client.rollbackCalls, 1)
})

test('rollback failure cannot mask the original operation failure', async () => {
  const client = new FailurePocClient('operation', 'ROLLBACK')
  await assertDatabaseUnavailable(await gatewayWithClient(client))
  assert.equal(client.rollbackCalls, 1)
  assert.equal(client.endCalls, 1)
})

test('client disposal failure is contained by the gateway', async () => {
  const client = new FailurePocClient('end')
  await assertDatabaseUnavailable(await gatewayWithClient(client))
  assert.equal(client.endCalls, 1)
})

test('asynchronous pg error event marks the client unusable without escaping', async () => {
  const client = new FailurePocClient()
  const originalConnect = client.connect.bind(client)
  client.connect = async () => {
    await originalConnect()
    client.emitConnectionError()
  }
  await assertDatabaseUnavailable(await gatewayWithClient(client))
  assert.equal(client.rollbackCalls, 0)
  assert.equal(client.endCalls, 0)
})

test('simultaneous connection failures all receive bounded JSON errors', async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, async () => (
    await gatewayWithClient(new FailurePocClient('connect'))
  )))
  for (const response of responses) await assertDatabaseUnavailable(response)
})

test('stalled connects time out without touching the in-flight socket', async () => {
  let endCalls = 0
  const stalledClient: PocPgClient = {
    connect: async () => await new Promise<void>(() => {}),
    query: async () => ({ rows: [] }),
    end: async () => { endCalls += 1 },
  }
  await assert.rejects(executePocOperation({
    connectionString: env.HYPERDRIVE.connectionString,
    actorId: USER_A,
    operation: 'list_my_student_classes',
    clientFactory: () => stalledClient,
    requestTimeoutMillis: 10,
  }), PocDatabaseUnavailableError)
  assert.equal(endCalls, 0)
})

test('failures followed by alternating users preserve transaction-local identity', async () => {
  await assertDatabaseUnavailable(await gatewayWithClient(new FailurePocClient('operation'), USER_A))
  const reused = new ReusedPocClient()
  for (const actor of [USER_A, USER_B, USER_A, USER_B]) {
    const response = await gatewayWithClient(reused, actor)
    assert.equal(response.status, 200)
    assert.equal(reused.actor, null)
  }
  assert.deepEqual(reused.operationActors, [USER_A, USER_B, USER_A, USER_B])
})

test('disabled PoC gateway is absent and does not verify or query', async () => {
  let calls = 0
  const response = await handlePocGateway(
    request(await token(), { operation: 'list_my_student_classes', params: {} }),
    { ...env, POC_AUTH_GATEWAY_ENABLED: 'false' },
    { verify: async () => { calls += 1; return { actorId: USER_A } }, execute: async () => { calls += 1; return [] } },
  )
  assert.equal(response.status, 404)
  assert.equal(calls, 0)
})
