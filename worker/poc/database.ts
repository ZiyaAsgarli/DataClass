import {
  executeGatewayDatabase,
  type GatewayPgClient,
  type GatewayPgClientFactory,
} from '../gateway/database.ts'
import { GatewayError } from '../gateway/errors.ts'
import type { GatewayOperationDefinition } from '../gateway/types.ts'
import type { PocOperationName } from './registry.ts'

export type PocPgClient = GatewayPgClient
export type PocPgClientFactory = GatewayPgClientFactory

export class PocDatabaseUnavailableError extends Error {
  constructor() {
    super('The PoC database is unavailable.')
    this.name = 'PocDatabaseUnavailableError'
  }
}

const definition: GatewayOperationDefinition = Object.freeze({
  key: 'list_my_student_classes',
  dbFunction: 'app_poc.list_my_student_classes',
  signature: 'app_poc.list_my_student_classes()',
  parameters: [],
  returnType: 'TABLE(class_id uuid, class_name text, student_count bigint)',
  resultKind: 'ROWS',
  resultColumns: [
    { name: 'class_id', type: 'uuid' },
    { name: 'class_name', type: 'text' },
    { name: 'student_count', type: 'bigint' },
  ],
  exposure: 'BROWSER',
  access: 'READ',
  mutationClass: null,
  authRequired: true,
  deadlineClass: 'READ',
  retryPolicy: 'NONE',
  sql: () => 'SELECT * FROM app_poc.list_my_student_classes()',
})

export interface ExecutePocOperationOptions {
  connectionString: string
  actorId: string
  operation: PocOperationName
  clientFactory?: PocPgClientFactory
  requestTimeoutMillis?: number
}

export async function executePocOperation(options: ExecutePocOperationOptions) {
  try {
    return await executeGatewayDatabase({
      connectionString: options.connectionString,
      actorId: options.actorId,
      invocation: { definition, sql: definition.sql([]), values: [] },
      clientFactory: options.clientFactory,
      overallDeadlineMillis: options.requestTimeoutMillis,
    }) as unknown[]
  } catch (error) {
    if (error instanceof GatewayError) throw new PocDatabaseUnavailableError()
    throw error
  }
}
