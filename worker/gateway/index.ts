import { GatewayError, gatewayErrorBody } from './errors.ts'
import { executeGatewayOperationBrowser } from './execute.ts'
import { parseGatewayRequest } from './registry.ts'
import type { GatewayEnv, VerifiedGatewayActor } from './types.ts'
import { verifyNeonJwt } from './verifyNeonJwt.ts'

export const GATEWAY_PATH = '/rpc'
export const GATEWAY_MAX_BODY_BYTES = 64 * 1024

interface GatewayDependencies {
  verify?: (
    token: string,
    config: { issuer: string; audience: string; jwksUrl: string },
  ) => Promise<VerifiedGatewayActor>
  execute?: typeof executeGatewayOperationBrowser
  observe?: (event: GatewayObservation) => void
}

export interface GatewayObservation {
  operation: string | null
  exposure: 'BROWSER'
  outcome: 'SUCCESS' | 'FAILURE'
  category: string
  durationBucket: '<100ms' | '<500ms' | '<2s' | '>=2s'
}

function durationBucket(milliseconds: number): GatewayObservation['durationBucket'] {
  if (milliseconds < 100) return '<100ms'
  if (milliseconds < 500) return '<500ms'
  if (milliseconds < 2_000) return '<2s'
  return '>=2s'
}

function headers(request: Request, env: GatewayEnv) {
  const result = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.headers.get('Origin') === env.GATEWAY_APP_ORIGIN) {
    result.set('Access-Control-Allow-Origin', env.GATEWAY_APP_ORIGIN)
    result.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    result.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    result.set('Access-Control-Max-Age', '3600')
    result.set('Vary', 'Origin')
  }
  return result
}

function json(request: Request, env: GatewayEnv, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: headers(request, env) })
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new GatewayError('AUTH_REQUIRED')
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8_192) throw new GatewayError('AUTH_REQUIRED')
  return token
}

async function readLimitedJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new GatewayError('VALIDATION')
  }
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > GATEWAY_MAX_BODY_BYTES) {
    throw new GatewayError('VALIDATION')
  }
  if (!request.body) throw new GatewayError('VALIDATION')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > GATEWAY_MAX_BODY_BYTES) {
      try {
        await reader.cancel()
      } catch {
        // A failed body cancellation must not escape the gateway boundary.
      }
      throw new GatewayError('VALIDATION')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new GatewayError('VALIDATION')
  }
}

export async function handleGatewayRequest(
  request: Request,
  env: GatewayEnv,
  dependencies: GatewayDependencies = {},
) {
  const startedAt = Date.now()
  let operation: string | null = null
  let outcome: GatewayObservation['outcome'] = 'FAILURE'
  let category = 'INTERNAL'
  try {
    const url = new URL(request.url)
    if (env.GATEWAY_ENABLED !== 'true' || url.pathname !== GATEWAY_PATH) {
      throw new GatewayError('NOT_FOUND')
    }
    if (request.headers.get('Origin') !== env.GATEWAY_APP_ORIGIN) throw new GatewayError('FORBIDDEN')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request, env) })
    if (request.method !== 'POST') throw new GatewayError('NOT_FOUND')
    const token = bearerToken(request)
    const verified = await (dependencies.verify ?? verifyNeonJwt)(token, {
      issuer: env.GATEWAY_NEON_JWT_ISSUER,
      audience: env.GATEWAY_NEON_JWT_AUDIENCE,
      jwksUrl: env.GATEWAY_NEON_JWKS_URL,
    })
    const parsed = parseGatewayRequest(await readLimitedJson(request))
    operation = parsed.definition.key
    const execute = dependencies.execute ?? executeGatewayOperationBrowser
    const data = await execute(env, verified.actorId, operation, Object.fromEntries(
      parsed.invocation.includedParameters.map((parameter, index) => [parameter.name, parsed.invocation.values[index]]),
    ))
    outcome = 'SUCCESS'
    category = 'SUCCESS'
    return json(request, env, 200, { data })
  } catch (error) {
    const gatewayError = error instanceof GatewayError ? error : new GatewayError('INTERNAL')
    category = gatewayError.code
    return json(request, env, gatewayError.status, gatewayErrorBody(gatewayError))
  } finally {
    dependencies.observe?.({
      operation,
      exposure: 'BROWSER',
      outcome,
      category,
      durationBucket: durationBucket(Date.now() - startedAt),
    })
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleGatewayRequest(request, env)
    } catch {
      const error = new GatewayError('INTERNAL')
      return json(request, env, error.status, gatewayErrorBody(error))
    }
  },
} satisfies ExportedHandler<GatewayEnv>
