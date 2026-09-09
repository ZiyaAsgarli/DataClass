import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla/adapters'
import { hashPassword } from 'better-auth/crypto'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { Client } from 'pg'
import { GATEWAY_MAX_BODY_BYTES } from '../worker/gateway/index.ts'

let DATABASE_URL = process.env.AUTH_GATEWAY_STAGE_DATABASE_URL
let AUTH_URL = process.env.AUTH_GATEWAY_STAGE_AUTH_URL
let JWKS_URL = process.env.AUTH_GATEWAY_STAGE_JWKS_URL
let HYPERDRIVE_ID = process.env.AUTH_GATEWAY_STAGE_HYPERDRIVE_ID
const ENABLED = process.env.RUN_AUTH_GATEWAY_LIVE === 'true'
const TEST_ORIGIN = 'https://isolated-gateway-test.invalid'
const WORKER_NAME = 'dataclass-auth-gateway-poc'
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerCli = path.join(repositoryRoot, 'node_modules/wrangler/bin/wrangler.js')
const neonCli = process.platform === 'win32'
  ? path.join(process.env.APPDATA ?? '', 'npm/node_modules/neonctl/bin/cli.js')
  : 'neon'

function command(executable: string, args: string[]) {
  try {
    return execFileSync(executable, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
  } catch (error) {
    const raw = typeof error === 'object' && error !== null && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : ''
    const sanitized = raw
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/\b[a-z0-9_-]{24,}\b/gi, '[identifier]')
      .trim().slice(-500)
    throw new Error(`An isolated infrastructure command failed.${sanitized ? ` ${sanitized}` : ''}`)
  }
}

function wrangler(args: string[]) {
  return command(process.execPath, [wranglerCli, ...args])
}

function neon(args: string[]) {
  return process.platform === 'win32'
    ? command(process.execPath, [neonCli, ...args])
    : command(neonCli, args)
}

function discoverInfrastructure() {
  if (DATABASE_URL && AUTH_URL && JWKS_URL && HYPERDRIVE_ID) return
  const projects = JSON.parse(neon(['projects', 'list', '--output', 'json'])) as Array<{
    id: string; name: string
  }>
  const project = projects.find(({ name }) => name === 'dataclass-auth-gateway-poc')
  if (!project) throw new Error('The isolated Neon project is unavailable.')
  DATABASE_URL = neon([
    'connection-string', 'main', '--project-id', project.id, '--database-name', 'poc',
    '--role-name', 'poc_owner', '--ssl', 'verify-full',
  ]).trim()
  const envRelativePath = `.wrangler/auth-gateway-env-${process.pid}.env`
  const envPath = path.join(repositoryRoot, envRelativePath)
  try {
    neon([
      'env', 'pull', '--project-id', project.id, '--file', envRelativePath, '--service', 'auth',
    ])
    const pairs = new Map<string, string>()
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match) pairs.set(match[1], match[2].replace(/^"|"$/g, ''))
    }
    AUTH_URL = pairs.get('NEON_AUTH_BASE_URL')
    JWKS_URL = pairs.get('NEON_AUTH_JWKS_URL')
  } finally {
    rmSync(envPath, { force: true })
  }
  const hyperdriveLine = wrangler(['hyperdrive', 'list']).split(/\r?\n/)
    .find((line) => line.includes('dataclass-auth-gateway-poc'))
  HYPERDRIVE_ID = hyperdriveLine?.split('│')[1]?.trim()
  if (!DATABASE_URL || !AUTH_URL || !JWKS_URL || !HYPERDRIVE_ID) {
    throw new Error('The retained isolated infrastructure is incomplete.')
  }
}

function updateHyperdrive(password: string) {
  wrangler([
    'hyperdrive', 'update', HYPERDRIVE_ID!, '--origin-user', 'dataclass_gateway',
    '--origin-password', password, '--caching-disabled',
  ])
}

async function alterGatewayPassword(admin: Client, password: string) {
  const command = await admin.query(
    "SELECT format('ALTER ROLE dataclass_gateway PASSWORD %L', $1::text) AS sql",
    [password],
  )
  await admin.query(command.rows[0].sql)
}

function deploy(configPath: string, issuer: string, audience: string) {
  const config = {
    $schema: path.join(repositoryRoot, 'node_modules/wrangler/config-schema.json'),
    name: WORKER_NAME,
    main: path.join(repositoryRoot, 'worker/gateway/index.ts'),
    compatibility_date: '2026-09-09',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: false,
    vars: {
      GATEWAY_ENABLED: 'true',
      GATEWAY_APP_ORIGIN: TEST_ORIGIN,
      GATEWAY_NEON_JWT_ISSUER: issuer,
      GATEWAY_NEON_JWT_AUDIENCE: audience,
      GATEWAY_NEON_JWKS_URL: JWKS_URL,
    },
    hyperdrive: [{ binding: 'HYPERDRIVE', id: HYPERDRIVE_ID }],
  }
  writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 })
  const output = wrangler(['deploy', '--config', configPath])
  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0]
  if (!url) throw new Error('The isolated Worker URL was not returned.')
  return url
}

function authClient() {
  let jwt: string | null = null
  const cookies = new Map<string, string>()
  const auth = createAuthClient(AUTH_URL!, {
    adapter: BetterAuthVanillaAdapter({
      fetchOptions: {
        headers: { Origin: new URL(AUTH_URL!).origin },
        onSuccess: (context) => {
          jwt = context.response.headers.get('set-auth-jwt') ?? jwt
          for (const line of context.response.headers.getSetCookie?.() ?? []) {
            const pair = line.split(';', 1)[0]
            const separator = pair.indexOf('=')
            if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
          }
        },
      },
    }),
  })
  return {
    auth,
    token: async () => {
      if (jwt) return jwt
      const response = await fetch(`${AUTH_URL}/get-session`, {
        headers: {
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          Origin: new URL(AUTH_URL!).origin,
        },
      })
      assert.equal(response.ok, true)
      return response.headers.get('set-auth-jwt')
    },
  }
}

async function acquireTokens(admin: Client) {
  const users = (await admin.query(`
    SELECT users.id::text, users.email, accounts.id AS account_id
    FROM neon_auth."user" users
    JOIN neon_auth.account accounts ON accounts."userId" = users.id
    WHERE accounts."providerId" = 'credential'
    ORDER BY users.id
  `)).rows
  assert.equal(users.length, 2)
  const actors: Array<{ id: string; jwt: string }> = []
  for (const user of users) {
    const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`
    const passwordHash = await hashPassword(password)
    await admin.query('UPDATE neon_auth.account SET password = $1, "updatedAt" = now() WHERE id = $2', [
      passwordHash, user.account_id,
    ])
    const client = authClient()
    const auth = client.auth
    const signIn = await auth.signIn.email({ email: user.email, password })
    assert.equal(signIn.error, null)
    const jwt = await client.token()
    assert.equal(typeof jwt, 'string')
    assert.equal(jwt!.split('.').length, 3)
    const issuer = new URL(AUTH_URL!).origin
    const claims = decodeJwt(jwt!)
    const header = decodeProtectedHeader(jwt!)
    assert.equal(header.alg, 'EdDSA')
    assert.equal(claims.iss, issuer)
    assert.equal(claims.aud, issuer)
    assert.equal(claims.sub, user.id)
    assert.ok(typeof claims.exp === 'number' && claims.exp > Date.now() / 1000)
    actors.push({ id: user.id, jwt: jwt! })
  }
  return actors
}

async function rpc(workerUrl: string, jwt: string | null, operation: string, params: Record<string, unknown>, options: {
  origin?: string; rawBody?: string
} = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: options.origin ?? TEST_ORIGIN })
  if (jwt !== null) headers.set('Authorization', `Bearer ${jwt}`)
  return await fetch(`${workerUrl}/rpc`, {
    method: 'POST', headers, body: options.rawBody ?? JSON.stringify({ operation, params }),
  })
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status)
  assert.match(response.headers.get('Content-Type') ?? '', /^application\/json/)
  const body = await response.json() as { error?: { code?: string } }
  assert.equal(body.error?.code, code)
  assert.doesNotMatch(JSON.stringify(body), /postgres|database host|connection string|stack|select /i)
}

async function main() {
  const configDirectory = path.join(repositoryRoot, '.wrangler')
  mkdirSync(configDirectory, { recursive: true })
  discoverInfrastructure()
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  const configPath = path.join(configDirectory, `auth-gateway-live-${process.pid}.json`)
  let gatewayPassword = `${crypto.randomBytes(32).toString('base64url')}Aa1!`
  let workerUrl = ''
  let finalIssuer = ''
  try {
    const database = (await admin.query('SELECT current_database() AS name')).rows[0].name
    assert.equal(database, 'poc')
    await alterGatewayPassword(admin, gatewayPassword)
    updateHyperdrive(gatewayPassword)
    const issuer = new URL(AUTH_URL!).origin
    finalIssuer = issuer
    workerUrl = deploy(configPath, issuer, issuer)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
    const [actorA, actorB] = await acquireTokens(admin)
    const fixtures = (await admin.query(`
      SELECT profiles.id::text,
        classes.id::text AS class_id,
        modules.id::text AS module_id,
        lessons.id::text AS lesson_id,
        assignments.id::text AS assignment_id,
        submissions.id::text AS submission_id,
        lesson_resources.id::text AS resource_id,
        classes.name AS class_name
      FROM public.profiles
      JOIN public.classes ON classes.teacher_id = profiles.id
      JOIN public.modules ON modules.class_id = classes.id
      JOIN public.lessons ON lessons.module_id = modules.id
      JOIN public.assignments ON assignments.lesson_id = lessons.id
      JOIN public.submissions ON submissions.assignment_id = assignments.id AND submissions.student_id = profiles.id
      JOIN public.lesson_resources ON lesson_resources.lesson_id = lessons.id
      ORDER BY profiles.id
    `)).rows
    assert.equal(fixtures.length, 2)
    const fixtureByActor = new Map(fixtures.map((fixture) => [fixture.id, fixture]))

    for (const actor of [actorA, actorB]) {
      const response = await rpc(workerUrl, actor.jwt, 'list_my_student_classes', {})
      assert.equal(response.status, 200)
      const body = await response.json() as { data: Array<{ id: string }> }
      assert.deepEqual(body.data.map(({ id }) => id), [fixtureByActor.get(actor.id).class_id])
    }
    const sequence = [actorA, actorB, actorA, actorB]
    const concurrent = await Promise.all(sequence.map(async (actor) => {
      const response = await rpc(workerUrl, actor.jwt, 'list_my_student_classes', {})
      assert.equal(response.status, 200)
      return ((await response.json()) as { data: Array<{ id: string }> }).data[0].id
    }))
    assert.deepEqual(concurrent, sequence.map(({ id }) => fixtureByActor.get(id).class_id))

    const fixtureA = fixtureByActor.get(actorA.id)
    for (const [operation, params] of [
      ['bootstrap_current_user', {}],
      ['get_class_overview', { target_class_id: fixtureA.class_id }],
      ['get_class_invitations', { target_class_id: fixtureA.class_id }],
      ['get_teacher_module', { target_module_id: fixtureA.module_id }],
      ['get_teacher_lesson', { target_lesson_id: fixtureA.lesson_id }],
      ['get_teacher_assignment', { target_assignment_id: fixtureA.assignment_id }],
      ['get_submission_detail', { target_submission_id: fixtureA.submission_id }],
    ] as const) {
      const response = await rpc(workerUrl, actorA.jwt, operation, params)
      assert.equal(response.status, 200, operation)
    }
    const m2Name = 'Isolated gateway M2'
    assert.equal((await rpc(workerUrl, actorA.jwt, 'update_owned_class', {
      target_class_id: fixtureA.class_id, class_name: m2Name, class_description: null, class_status: 'active',
    })).status, 200)
    assert.equal((await admin.query('SELECT name FROM public.classes WHERE id = $1', [fixtureA.class_id])).rows[0].name, m2Name)
    assert.equal((await rpc(workerUrl, actorA.jwt, 'update_owned_class', {
      target_class_id: fixtureA.class_id, class_name: fixtureA.class_name,
      class_description: 'Isolated fixture', class_status: 'active',
    })).status, 200)
    assert.equal((await rpc(workerUrl, actorA.jwt, 'reorder_lesson', {
      target_lesson_id: fixtureA.lesson_id, move_direction: 'up',
    })).status, 200)

    await expectError(await rpc(workerUrl, null, 'list_my_student_classes', {}), 401, 'AUTH_REQUIRED')
    await expectError(await rpc(workerUrl, 'malformed', 'list_my_student_classes', {}), 401, 'AUTH_REQUIRED')
    const tampered = `${actorA.jwt.slice(0, -1)}${actorA.jwt.endsWith('a') ? 'b' : 'a'}`
    await expectError(await rpc(workerUrl, tampered, 'list_my_student_classes', {}), 401, 'AUTH_REQUIRED')
    await expectError(await rpc(workerUrl, actorB.jwt, 'list_my_student_classes', { user_id: actorA.id }), 400, 'VALIDATION')
    await expectError(await rpc(workerUrl, actorA.jwt, 'unknown', {}), 404, 'NOT_FOUND')
    await expectError(await rpc(workerUrl, actorA.jwt, 'authorize_lesson_resource_download', {
      target_resource_id: fixtureA.resource_id,
    }), 404, 'NOT_FOUND')
    await expectError(await rpc(workerUrl, actorA.jwt, 'list_my_student_classes; SELECT 1', {}), 404, 'NOT_FOUND')
    await expectError(await rpc(workerUrl, actorA.jwt, 'list_my_student_classes', { sql: 'SELECT 1' }), 400, 'VALIDATION')
    await expectError(await rpc(workerUrl, actorA.jwt, 'list_my_student_classes', {}, {
      rawBody: JSON.stringify({ operation: 'list_my_student_classes', params: {}, padding: 'x'.repeat(GATEWAY_MAX_BODY_BYTES) }),
    }), 400, 'VALIDATION')
    await expectError(await rpc(workerUrl, actorA.jwt, 'list_my_student_classes', {}, {
      origin: 'https://wrong-origin.invalid',
    }), 403, 'FORBIDDEN')

    const badPassword = `${crypto.randomBytes(32).toString('base64url')}Aa1!`
    await alterGatewayPassword(admin, badPassword)
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE usename = 'dataclass_gateway' AND pid <> pg_backend_pid()`)
    const failed = await Promise.all(Array.from({ length: 6 }, () => rpc(workerUrl, actorA.jwt, 'list_my_student_classes', {})))
    for (const response of failed) await expectError(response, 503, 'DATABASE_UNAVAILABLE')
    await alterGatewayPassword(admin, gatewayPassword)
    let recovered = false
    for (let attempt = 0; attempt < 15 && !recovered; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      const response = await rpc(workerUrl, actorB.jwt, 'list_my_student_classes', {})
      recovered = response.status === 200
    }
    assert.equal(recovered, true)
    console.log(JSON.stringify({
      realJwt: 'PASS', sequentialIsolation: 'PASS', concurrentIsolation: 'PASS', m2: 'PASS', m3: 'PASS',
      domains: 'PASS', negativeSecurity: 'PASS', failureContainment: 'PASS', cloudflare1101: false,
      healthyAfterFailure: 'PASS', workerDeployed: true,
    }))
  } finally {
    if (gatewayPassword) await alterGatewayPassword(admin, gatewayPassword)
    if (gatewayPassword) updateHyperdrive(gatewayPassword)
    if (finalIssuer) {
      deploy(configPath, finalIssuer, finalIssuer)
      await new Promise((resolve) => setTimeout(resolve, 5_000))
    }
    rmSync(configPath, { force: true })
    await admin.end().catch(() => undefined)
  }
}

test('full gateway live on isolated Worker, Hyperdrive, Auth, and database', {
  skip: ENABLED ? false : 'requires retained isolated infrastructure',
  timeout: 300_000,
}, main)
