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
  onError?(listener: () => void): void
}

export type PocPgClientFactory = (connectionString: string) => PocPgClient

export class PocDatabaseUnavailableError extends Error {
  constructor() {
    super('The PoC database is unavailable.')
    this.name = 'PocDatabaseUnavailableError'
  }
}

function defaultClientFactory(connectionString: string): PocPgClient {
  // Cloudflare recommends one Client per request with Hyperdrive owning the
  // underlying pool. Driver-level socket timers are deliberately omitted.
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

export interface ExecutePocOperationOptions {
  connectionString: string
  actorId: string
  operation: PocOperationName
  clientFactory?: PocPgClientFactory
  requestTimeoutMillis?: number
}

export async function executePocOperation(options: ExecutePocOperationOptions) {
  const definition = POC_OPERATION_REGISTRY[options.operation]
  const client = (options.clientFactory ?? defaultClientFactory)(options.connectionString)
  let transactionStarted = false
  let connected = false
  let clientUnusable = false
  let deadlineExpired = false

  client.onError?.(() => {
    // A connected Client can emit a socket error outside an awaited query.
    // Mark this request-scoped client unusable; never retry or reuse it.
    clientUnusable = true
  })

  const assertUsable = () => {
    if (clientUnusable || deadlineExpired) throw new PocDatabaseUnavailableError()
  }

  const lifecycle = async () => {
    let primaryFailure = false
    let normalizedRows: unknown[] | undefined

    try {
      await client.connect()
      connected = true
      assertUsable()

      await client.query('BEGIN')
      transactionStarted = true
      assertUsable()
      await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      await client.query(
        "SELECT set_config('app.verified_actor_id', $1, true)",
        [options.actorId],
      )
      const assertion = await client.query<{ actor_id: string | null }>(
        'SELECT app_private.current_actor_id()::text AS actor_id',
      )
      if (assertion.rows[0]?.actor_id !== options.actorId) {
        throw new PocDatabaseUnavailableError()
      }
      assertUsable()

      const result = await client.query(definition.sql)
      assertUsable()
      await client.query('COMMIT')
      transactionStarted = false
      assertUsable()

      const cleared = await client.query<{ actor_id: string | null }>(
        'SELECT app_private.current_actor_id()::text AS actor_id',
      )
      if (cleared.rows[0]?.actor_id != null) throw new PocDatabaseUnavailableError()
      assertUsable()
      normalizedRows = definition.normalizeRows(result.rows)
    } catch {
      primaryFailure = true
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK')
          transactionStarted = false
        } catch {
          // Cleanup failure never replaces the primary database failure.
        }
      }
    } finally {
      // A failed connect or asynchronous socket error is already owned by pg's
      // connection-error path. Calling end() again on an in-flight/dead
      // pg-cloudflare socket can start work outside Client.end()'s promise.
      if (connected && !clientUnusable) {
        try {
          await client.end()
        } catch {
          primaryFailure = true
        }
      }
    }

    if (primaryFailure || clientUnusable || deadlineExpired || !normalizedRows) {
      throw new PocDatabaseUnavailableError()
    }
    return normalizedRows
  }

  let deadline: ReturnType<typeof setTimeout> | undefined
  const boundedFailure = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      // Reject first and do not touch the in-flight Cloudflare socket here.
      // The request can return JSON while Workers cancels its request-scoped I/O.
      deadlineExpired = true
      reject(new PocDatabaseUnavailableError())
    }, options.requestTimeoutMillis ?? 12_000)
  })

  try {
    return await Promise.race([lifecycle(), boundedFailure])
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}
