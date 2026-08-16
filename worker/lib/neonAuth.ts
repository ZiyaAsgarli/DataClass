import type { WorkerEnv } from '../types'

export class NeonAuthorizationError extends Error {
  constructor(public readonly status: number) {
    super('The requested resource is unavailable or access was denied.')
  }
}

export function requireBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new NeonAuthorizationError(401)
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8192) throw new NeonAuthorizationError(401)
  return token
}

export async function callNeonRpc<T>(
  env: WorkerEnv,
  token: string,
  functionName: string,
  body: Record<string, unknown>,
) {
  const baseUrl = new URL(env.NEON_DATA_API_URL)
  if (baseUrl.protocol !== 'https:' || !baseUrl.hostname.includes('.apirest.')) {
    throw new Error('Worker Data API configuration is invalid.')
  }
  const endpoint = new URL(`rpc/${functionName}`, `${baseUrl.toString().replace(/\/+$/, '')}/`)
  const response = await fetch(endpoint, {
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

  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 400
    throw new NeonAuthorizationError(status)
  }
  if (response.status === 204) return null as T
  return await response.json() as T
}

export function firstRow<T>(value: T[] | null) {
  const row = value?.[0]
  if (!row) throw new NeonAuthorizationError(404)
  return row
}
