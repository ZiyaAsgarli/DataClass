import { executeGatewayOperationInternal } from '../gateway/execute.ts'
import { GatewayError } from '../gateway/errors.ts'
import type { GatewayExecutionDependencies } from '../gateway/execute.ts'
import type { VerifiedGatewayActor } from '../gateway/types.ts'
import { verifyNeonJwt } from '../gateway/verifyNeonJwt.ts'
import type { WorkerEnv } from '../types.ts'

interface InternalGatewayDependencies extends GatewayExecutionDependencies {
  verify?: (
    token: string,
    config: { issuer: string; audience: string; jwksUrl: string },
  ) => Promise<VerifiedGatewayActor>
  execute?: typeof executeGatewayOperationInternal
}

export interface InternalGatewaySession {
  execute<T>(operation: string, params: Readonly<Record<string, unknown>>): Promise<T>
}

export function requireBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new GatewayError('AUTH_REQUIRED')
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8_192) throw new GatewayError('AUTH_REQUIRED')
  return token
}

export async function createInternalGatewaySession(
  env: WorkerEnv,
  token: string,
  dependencies: InternalGatewayDependencies = {},
): Promise<InternalGatewaySession> {
  const actor = await (dependencies.verify ?? verifyNeonJwt)(token, {
    issuer: env.GATEWAY_NEON_JWT_ISSUER,
    audience: env.GATEWAY_NEON_JWT_AUDIENCE,
    jwksUrl: env.GATEWAY_NEON_JWKS_URL,
  })
  const execute = dependencies.execute ?? executeGatewayOperationInternal
  return Object.freeze({
    execute: async <T>(operation: string, params: Readonly<Record<string, unknown>>) => {
      return await execute(env, actor.actorId, operation, params, {
        clientFactory: dependencies.clientFactory,
      }) as T
    },
  })
}

export function firstRow<T>(value: T[] | null) {
  const row = value?.[0]
  if (!row) throw new GatewayError('NOT_FOUND')
  return row
}
