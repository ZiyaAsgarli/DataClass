import { executePocOperation, PocDatabaseUnavailableError } from './database.ts'
import { parsePocOperationRequest, PocRequestError, type PocOperationName } from './registry.ts'
import { PocAuthenticationError, verifyNeonJwt } from './verifyNeonJwt.ts'

const POC_PATH = '/internal-poc/rpc'
const MAX_BODY_BYTES = 4_096

export interface PocWorkerEnv {
  POC_AUTH_GATEWAY_ENABLED: string
  POC_APP_ORIGIN: string
  POC_NEON_JWT_ISSUER: string
  POC_NEON_JWT_AUDIENCE: string
  POC_NEON_JWKS_URL: string
  HYPERDRIVE: { connectionString: string }
}

interface PocGatewayDependencies {
  verify?: typeof verifyNeonJwt
  execute?: (
    env: PocWorkerEnv,
    actorId: string,
    operation: PocOperationName,
  ) => Promise<unknown[]>
}

function responseHeaders(request: Request, env: PocWorkerEnv) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.headers.get('Origin') === env.POC_APP_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.POC_APP_ORIGIN)
    headers.set('Vary', 'Origin')
  }
  return headers
}

function jsonResponse(request: Request, env: PocWorkerEnv, status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders(request, env),
  })
}

function databaseUnavailableResponse(request: Request, env: PocWorkerEnv) {
  return jsonResponse(request, env, 503, {
    error: {
      code: 'GATEWAY_DATABASE_UNAVAILABLE',
      message: 'The service is temporarily unavailable.',
    },
  })
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new PocAuthenticationError('AUTH_REQUIRED')
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8_192) throw new PocAuthenticationError('AUTH_REQUIRED')
  return token
}

async function readLimitedJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new PocRequestError('Content-Type must be application/json.')
  }
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PocRequestError('The PoC request is too large.')
  }
  if (!request.body) throw new PocRequestError()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new PocRequestError('The PoC request is too large.')
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
    throw new PocRequestError()
  }
}

async function defaultExecute(
  env: PocWorkerEnv,
  actorId: string,
  operation: PocOperationName,
) {
  return await executePocOperation({
    connectionString: env.HYPERDRIVE.connectionString,
    actorId,
    operation,
  })
}

export async function handlePocGateway(
  request: Request,
  env: PocWorkerEnv,
  dependencies: PocGatewayDependencies = {},
) {
  const url = new URL(request.url)
  if (env.POC_AUTH_GATEWAY_ENABLED !== 'true' || url.pathname !== POC_PATH) {
    return jsonResponse(request, env, 404, { error: 'Endpoint not found.' })
  }
  if (request.headers.get('Origin') !== env.POC_APP_ORIGIN) {
    return jsonResponse(request, env, 403, { error: 'Origin is not allowed.' })
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, env, 405, { error: 'Method not allowed.' })
  }

  try {
    const token = bearerToken(request)
    const verify = dependencies.verify ?? verifyNeonJwt
    const verified = await verify(token, {
      issuer: env.POC_NEON_JWT_ISSUER,
      audience: env.POC_NEON_JWT_AUDIENCE,
      jwksUrl: env.POC_NEON_JWKS_URL,
    })
    const operationRequest = parsePocOperationRequest(await readLimitedJson(request))
    const execute = dependencies.execute ?? defaultExecute
    const rows = await execute(env, verified.actorId, operationRequest.operation)
    return jsonResponse(request, env, 200, { data: rows })
  } catch (error) {
    if (error instanceof PocAuthenticationError) {
      return jsonResponse(request, env, 401, { error: 'Authentication failed.' })
    }
    if (error instanceof PocRequestError) {
      return jsonResponse(request, env, 400, { error: error.message })
    }
    if (error instanceof PocDatabaseUnavailableError) {
      return databaseUnavailableResponse(request, env)
    }
    return jsonResponse(request, env, 500, {
      error: {
        code: 'GATEWAY_INTERNAL_ERROR',
        message: 'The service encountered an unexpected error.',
      },
    })
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handlePocGateway(request, env)
    } catch {
      return jsonResponse(request, env, 500, {
        error: {
          code: 'GATEWAY_INTERNAL_ERROR',
          message: 'The service encountered an unexpected error.',
        },
      })
    }
  },
} satisfies ExportedHandler<PocWorkerEnv>
