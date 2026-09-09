import { Client } from 'pg'
import { classifyDatabaseError, GatewayError } from './errors.ts'
import { normalizeGatewayResult } from './normalize.ts'
import type { GatewayOperationDefinition } from './types.ts'

export const GATEWAY_OVERALL_DEADLINE_MS = 15_000
export const GATEWAY_CONNECT_DEADLINE_MS = 5_000
export const GATEWAY_STATEMENT_TIMEOUT_MS = 8_000
export const GATEWAY_IDLE_TRANSACTION_TIMEOUT_MS = 12_000

interface QueryResult<Row extends Record<string, unknown>> {
  rows: Row[]
}

export interface GatewayPgClient {
  connect(): Promise<void>
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>
  end(): Promise<void>
  onError?(listener: () => void): void
}

export type GatewayPgClientFactory = (connectionString: string) => GatewayPgClient

function defaultClientFactory(connectionString: string): GatewayPgClient {
  const client = new Client({ connectionString })
  return {
    connect: async () => { await client.connect() },
    query: async <Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      const result = await client.query(text, values ? [...values] : undefined)
      return { rows: result.rows as Row[] }
    },
    end: async () => { await client.end() },
    onError: (listener) => { client.on('error', listener) },
  }
}

export interface GatewayDatabaseInvocation {
  definition: GatewayOperationDefinition
  sql: string
  values: readonly unknown[]
}

export interface ExecuteGatewayDatabaseOptions {
  connectionString: string
  actorId: string
  invocation: GatewayDatabaseInvocation
  clientFactory?: GatewayPgClientFactory
  overallDeadlineMillis?: number
  connectDeadlineMillis?: number
}

function deadline(milliseconds: number, onExpire: () => void) {
  let handle: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => {
      onExpire()
      reject(new GatewayError('DATABASE_UNAVAILABLE'))
    }, milliseconds)
  })
  return { promise, clear: () => { if (handle) clearTimeout(handle) } }
}

export async function executeGatewayDatabase(options: ExecuteGatewayDatabaseOptions) {
  const client = (options.clientFactory ?? defaultClientFactory)(options.connectionString)
  let transactionStarted = false
  let connected = false
  let clientUnusable = false
  let deadlineExpired = false
  client.onError?.(() => { clientUnusable = true })

  const assertUsable = () => {
    if (clientUnusable || deadlineExpired) throw new GatewayError('DATABASE_UNAVAILABLE')
  }

  const lifecycle = async () => {
    let primaryError: unknown
    let normalized: unknown
    try {
      const connectLimit = deadline(options.connectDeadlineMillis ?? GATEWAY_CONNECT_DEADLINE_MS, () => {
        deadlineExpired = true
      })
      try {
        await Promise.race([client.connect(), connectLimit.promise])
      } finally {
        connectLimit.clear()
      }
      connected = true
      assertUsable()
      await client.query('BEGIN')
      transactionStarted = true
      await client.query(`SET LOCAL statement_timeout = '${GATEWAY_STATEMENT_TIMEOUT_MS}ms'`)
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${GATEWAY_IDLE_TRANSACTION_TIMEOUT_MS}ms'`)
      await client.query("SELECT set_config('app.verified_actor_id', $1, true)", [options.actorId])
      const assertion = await client.query<{ actor_id: string | null }>(
        'SELECT app_private.current_actor_id()::text AS actor_id',
      )
      if (assertion.rows[0]?.actor_id !== options.actorId) throw new GatewayError('FORBIDDEN')
      assertUsable()
      const result = await client.query(options.invocation.sql, options.invocation.values)
      assertUsable()
      await client.query('COMMIT')
      transactionStarted = false
      assertUsable()
      normalized = normalizeGatewayResult(options.invocation.definition, result.rows)
    } catch (error) {
      primaryError = error
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK')
          transactionStarted = false
        } catch {
          // Cleanup failure never replaces the operation failure.
        }
      }
    } finally {
      if (connected && !clientUnusable) {
        try {
          await client.end()
        } catch (error) {
          primaryError ??= error
        }
      }
    }
    if (primaryError) {
      if (primaryError instanceof GatewayError) throw primaryError
      throw classifyDatabaseError(primaryError)
    }
    if (clientUnusable || deadlineExpired) throw new GatewayError('DATABASE_UNAVAILABLE')
    return normalized
  }

  const overallLimit = deadline(options.overallDeadlineMillis ?? GATEWAY_OVERALL_DEADLINE_MS, () => {
    deadlineExpired = true
  })
  try {
    return await Promise.race([lifecycle(), overallLimit.promise])
  } finally {
    overallLimit.clear()
  }
}
