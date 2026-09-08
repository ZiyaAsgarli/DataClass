import { Client } from 'pg'
import { POC_OPERATION_REGISTRY, type PocOperationName } from './registry.ts'

interface QueryResult<Row extends Record<string, unknown>> {
  rows: Row[]
}

export interface PocPgClient {
  connect(): Promise<void>
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>
  end(): Promise<void>
}

export type PocPgClientFactory = (connectionString: string) => PocPgClient

function defaultClientFactory(connectionString: string): PocPgClient {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 10_000,
  })
  return {
    connect: async () => { await client.connect() },
    query: async <Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      const result = await client.query(text, values ? [...values] : undefined)
      return { rows: result.rows as Row[] }
    },
    end: () => client.end(),
  }
}

export interface ExecutePocOperationOptions {
  connectionString: string
  actorId: string
  operation: PocOperationName
  clientFactory?: PocPgClientFactory
}

export async function executePocOperation(options: ExecutePocOperationOptions) {
  const definition = POC_OPERATION_REGISTRY[options.operation]
  const client = (options.clientFactory ?? defaultClientFactory)(options.connectionString)
  let transactionOpen = false

  await client.connect()
  try {
    await client.query('BEGIN')
    transactionOpen = true
    await client.query(
      "SELECT set_config('app.verified_actor_id', $1, true)",
      [options.actorId],
    )
    const assertion = await client.query<{ actor_id: string | null }>(
      'SELECT app_private.current_actor_id()::text AS actor_id',
    )
    if (assertion.rows[0]?.actor_id !== options.actorId) {
      throw new Error('The verified database actor context was not established.')
    }

    const result = await client.query(definition.sql)
    await client.query('COMMIT')
    transactionOpen = false

    const cleared = await client.query<{ actor_id: string | null }>(
      'SELECT app_private.current_actor_id()::text AS actor_id',
    )
    if (cleared.rows[0]?.actor_id != null) {
      throw new Error('The verified database actor context escaped its transaction.')
    }
    return result.rows
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The original error remains authoritative; the connection is discarded below.
      }
    }
    throw error
  } finally {
    await client.end()
  }
}
