import { executeGatewayDatabase, type GatewayPgClientFactory } from './database.ts'
import { GatewayError } from './errors.ts'
import {
  GATEWAY_OPERATION_REGISTRY,
  resolveInternalGatewayOperation,
  validateGatewayParameters,
} from './registry.ts'
import type { GatewayEnv } from './types.ts'

export interface GatewayExecutionDependencies {
  clientFactory?: GatewayPgClientFactory
}

async function execute(
  env: GatewayEnv,
  actorId: string,
  operation: string,
  params: Readonly<Record<string, unknown>>,
  expectedExposure: 'BROWSER' | 'WORKER_INTERNAL',
  dependencies: GatewayExecutionDependencies,
) {
  const definition = GATEWAY_OPERATION_REGISTRY[operation]
  if (!definition || definition.exposure !== expectedExposure) throw new GatewayError('NOT_FOUND')
  const invocation = expectedExposure === 'WORKER_INTERNAL'
    ? resolveInternalGatewayOperation(operation, params)
    : validateGatewayParameters(definition, params)
  return await executeGatewayDatabase({
    connectionString: env.HYPERDRIVE.connectionString,
    actorId,
    invocation,
    clientFactory: dependencies.clientFactory,
  })
}

export async function executeGatewayOperationBrowser(
  env: GatewayEnv,
  actorId: string,
  operation: string,
  params: Readonly<Record<string, unknown>>,
  dependencies: GatewayExecutionDependencies = {},
) {
  return await execute(env, actorId, operation, params, 'BROWSER', dependencies)
}

export async function executeGatewayOperationInternal(
  env: GatewayEnv,
  actorId: string,
  operation: string,
  params: Readonly<Record<string, unknown>>,
  dependencies: GatewayExecutionDependencies = {},
) {
  return await execute(env, actorId, operation, params, 'WORKER_INTERNAL', dependencies)
}
