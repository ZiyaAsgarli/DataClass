export const FRONTEND_GATEWAY_TIMEOUT_MS = 12_000

export type GatewayRpcErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL'

const ERROR_DETAILS = Object.freeze({
  AUTH_REQUIRED: { status: 401, message: 'Authentication is required.' },
  FORBIDDEN: { status: 403, message: 'The operation is not permitted.' },
  NOT_FOUND: { status: 404, message: 'The requested item was not found.' },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state.' },
  VALIDATION: { status: 400, message: 'The request is invalid.' },
  DATABASE_UNAVAILABLE: { status: 503, message: 'The service is temporarily unavailable.' },
  INTERNAL: { status: 500, message: 'The service encountered an unexpected error.' },
} satisfies Record<GatewayRpcErrorCode, { status: number; message: string }>)

const GATEWAY_ERROR_CODES = new Set<GatewayRpcErrorCode>(
  Object.keys(ERROR_DETAILS) as GatewayRpcErrorCode[],
)

export class GatewayRpcError extends Error {
  readonly code: GatewayRpcErrorCode
  readonly status: number

  constructor(code: GatewayRpcErrorCode) {
    const detail = ERROR_DETAILS[code]
    super(detail.message)
    this.name = 'GatewayRpcError'
    this.code = code
    this.status = detail.status
  }
}

interface GatewayErrorBody {
  error?: {
    code?: unknown
  }
}

interface GatewaySuccessBody<T> {
  data: T
}

export interface GatewayRpcDependencies {
  gatewayUrl: string | undefined
  getToken: () => Promise<string | null>
  fetcher?: typeof fetch
  timeoutMs?: number
}

function normalizeGatewayUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, '')
  if (!normalized) throw new Error('Missing browser-safe RPC gateway URL configuration.')
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function gatewayCode(value: unknown): GatewayRpcErrorCode | null {
  return typeof value === 'string' && GATEWAY_ERROR_CODES.has(value as GatewayRpcErrorCode)
    ? value as GatewayRpcErrorCode
    : null
}

async function parseResponseBody(response: Response) {
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw new GatewayRpcError('INTERNAL')
  }
}

export function createGatewayRpcCaller(dependencies: GatewayRpcDependencies) {
  const fetcher = dependencies.fetcher ?? fetch
  const timeoutMs = dependencies.timeoutMs ?? FRONTEND_GATEWAY_TIMEOUT_MS

  return async function call<T>(operation: string, params: Record<string, unknown> = {}): Promise<T> {
    const token = await dependencies.getToken()
    if (!token) throw new GatewayRpcError('AUTH_REQUIRED')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetcher(`${normalizeGatewayUrl(dependencies.gatewayUrl)}/rpc`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation, params }),
        signal: controller.signal,
      })
    } catch {
      throw new GatewayRpcError('DATABASE_UNAVAILABLE')
    } finally {
      clearTimeout(timeout)
    }

    const body = await parseResponseBody(response)
    if (!response.ok) {
      const code = isRecord(body) && isRecord((body as GatewayErrorBody).error)
        ? gatewayCode((body as GatewayErrorBody).error?.code)
        : null
      throw new GatewayRpcError(code ?? 'INTERNAL')
    }
    if (!isRecord(body) || !Object.prototype.hasOwnProperty.call(body, 'data')) {
      throw new GatewayRpcError('INTERNAL')
    }
    return (body as unknown as GatewaySuccessBody<T>).data
  }
}

const configuredGatewayUrl = import.meta.env?.VITE_RPC_GATEWAY_URL

export const callGatewayRpc = createGatewayRpcCaller({
  gatewayUrl: configuredGatewayUrl,
  getToken: async () => {
    const { getCurrentNeonAuthToken } = await import('@/lib/neon')
    return getCurrentNeonAuthToken()
  },
})
