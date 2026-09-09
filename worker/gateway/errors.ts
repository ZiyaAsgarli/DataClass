export type GatewayErrorCode =
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
} satisfies Record<GatewayErrorCode, { status: number; message: string }>)

export class GatewayError extends Error {
  readonly code: GatewayErrorCode
  readonly status: number

  constructor(code: GatewayErrorCode, safeMessage?: string) {
    const detail = ERROR_DETAILS[code]
    super(safeMessage ?? detail.message)
    this.name = 'GatewayError'
    this.code = code
    this.status = detail.status
  }
}

interface PostgresErrorLike {
  readonly code?: unknown
  readonly message?: unknown
}

const SAFE_APPLICATION_MESSAGES = new Set([
  'Another module is already active for this class.',
  'Change the module teaching status before archiving it.',
])

export function classifyDatabaseError(error: unknown) {
  const sqlstate = typeof error === 'object' && error !== null
    ? (error as PostgresErrorLike).code
    : undefined
  const message = typeof error === 'object' && error !== null
    ? (error as PostgresErrorLike).message
    : undefined
  if (typeof sqlstate !== 'string') return new GatewayError('DATABASE_UNAVAILABLE')
  if (sqlstate === '42501') return new GatewayError('FORBIDDEN')
  if (sqlstate === '02000' || sqlstate === 'P0002') return new GatewayError('NOT_FOUND')
  if (sqlstate === '23505' || sqlstate === '23P01') {
    return new GatewayError('CONFLICT', typeof message === 'string' && SAFE_APPLICATION_MESSAGES.has(message) ? message : undefined)
  }
  if (sqlstate.startsWith('22') || sqlstate === '23502' || sqlstate === '23503'
    || sqlstate === '23514' || sqlstate === 'P0001') {
    return new GatewayError('VALIDATION', typeof message === 'string' && SAFE_APPLICATION_MESSAGES.has(message) ? message : undefined)
  }
  if (sqlstate.startsWith('08') || sqlstate.startsWith('28') || sqlstate.startsWith('53') || sqlstate === '57014'
    || sqlstate === '57P01' || sqlstate === '57P02' || sqlstate === '57P03') {
    return new GatewayError('DATABASE_UNAVAILABLE')
  }
  return new GatewayError('INTERNAL')
}

export function gatewayErrorBody(error: GatewayError) {
  return { error: { code: error.code, message: error.message } }
}
