import type { WorkerEnv } from '../types'

export const READ_ONLY_IDENTITY_RETRY_RPC_NAMES = Object.freeze([
  'authorize_lesson_resource_download',
  'authorize_lesson_resource_delete',
  'authorize_assignment_resource_download',
  'authorize_assignment_resource_delete',
  'authorize_submission_file_download',
  'get_lesson_resource_upload_state',
  'get_assignment_resource_upload_state',
  'get_submission_file_upload_state',
] as const)

const readOnlyIdentityRetryRpcs = new Set<string>(READ_ONLY_IDENTITY_RETRY_RPC_NAMES)

export const NEON_IDENTITY_RETRY_DELAY_MS = 300

interface NeonErrorDetails {
  code: string | null
  message: string | null
  details: string | null
  hint: string | null
}

interface NeonRpcCallOptions {
  fetcher?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
  log?: (entry: NeonRetryDiagnostic) => void
}

export interface NeonRetryDiagnostic {
  category: 'NEON_IDENTITY_READONLY_RETRY'
  rpcName: string
  attempt: 1 | 2
  httpStatus: number
  postgresCode: string | null
  retryEligible: boolean
  retryPerformed: boolean
  retrySucceeded: boolean
}

export class NeonAuthorizationError extends Error {
  readonly status: number
  readonly postgresCode: string | null
  readonly neonMessage: string | null
  readonly details: string | null
  readonly hint: string | null

  constructor(status: number, neonError?: NeonErrorDetails) {
    super('The requested resource is unavailable or access was denied.')
    this.status = status
    this.postgresCode = neonError?.code ?? null
    this.neonMessage = neonError?.message ?? null
    this.details = neonError?.details ?? null
    this.hint = neonError?.hint ?? null
  }
}

export function requireBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new NeonAuthorizationError(401)
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8192) throw new NeonAuthorizationError(401)
  return token
}

export function isReadOnlyIdentityRetryRpc(functionName: string) {
  return readOnlyIdentityRetryRpcs.has(functionName)
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value : null
}

async function parseNeonError(response: Response): Promise<NeonErrorDetails> {
  try {
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { code: null, message: null, details: null, hint: null }
    }
    const record = value as Record<string, unknown>
    return {
      code: safeString(record.code),
      message: safeString(record.message),
      details: safeString(record.details),
      hint: safeString(record.hint),
    }
  } catch {
    return { code: null, message: null, details: null, hint: null }
  }
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function defaultLog(entry: NeonRetryDiagnostic) {
  console.info(JSON.stringify(entry))
}

function mappedStatus(status: number) {
  return status === 401 ? 401 : status === 403 ? 403 : 400
}

export async function callNeonRpc<T>(
  env: WorkerEnv,
  token: string,
  functionName: string,
  body: Record<string, unknown>,
  options: NeonRpcCallOptions = {},
) {
  const baseUrl = new URL(env.NEON_DATA_API_URL)
  if (baseUrl.protocol !== 'https:' || !baseUrl.hostname.includes('.apirest.')) {
    throw new Error('Worker Data API configuration is invalid.')
  }
  const endpoint = new URL(`rpc/${functionName}`, `${baseUrl.toString().replace(/\/+$/, '')}/`)
  const fetcher = options.fetcher ?? fetch
  const wait = options.wait ?? defaultWait
  const log = options.log ?? defaultLog

  for (const attempt of [1, 2] as const) {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      if (attempt === 2) {
        log({
          category: 'NEON_IDENTITY_READONLY_RETRY', rpcName: functionName,
          attempt, httpStatus: response.status, postgresCode: null,
          retryEligible: false, retryPerformed: true, retrySucceeded: true,
        })
      }
      if (response.status === 204) return null as T
      return await response.json() as T
    }

    const neonError = await parseNeonError(response)
    const retryEligible = attempt === 1
      && token.length > 0
      && isReadOnlyIdentityRetryRpc(functionName)
      && response.status === 403
      && neonError.code === '42501'

    if (retryEligible) {
      log({
        category: 'NEON_IDENTITY_READONLY_RETRY', rpcName: functionName,
        attempt, httpStatus: response.status, postgresCode: neonError.code,
        retryEligible: true, retryPerformed: true, retrySucceeded: false,
      })
      await wait(NEON_IDENTITY_RETRY_DELAY_MS)
      continue
    }

    if (attempt === 2) {
      log({
        category: 'NEON_IDENTITY_READONLY_RETRY', rpcName: functionName,
        attempt, httpStatus: response.status, postgresCode: neonError.code,
        retryEligible: false, retryPerformed: true, retrySucceeded: false,
      })
    }
    throw new NeonAuthorizationError(mappedStatus(response.status), neonError)
  }

  throw new NeonAuthorizationError(403)
}

export function firstRow<T>(value: T[] | null) {
  const row = value?.[0]
  if (!row) throw new NeonAuthorizationError(404)
  return row
}
