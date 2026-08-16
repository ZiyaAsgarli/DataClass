import type { WorkerEnv } from '../types'

const allowedMethods = 'POST, DELETE, OPTIONS'
const allowedHeaders = 'Authorization, Content-Type'

export function corsHeaders(request: Request, env: WorkerEnv) {
  const origin = request.headers.get('Origin')
  const headers = new Headers({ Vary: 'Origin' })
  if (origin === env.APP_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', allowedMethods)
    headers.set('Access-Control-Allow-Headers', allowedHeaders)
    headers.set('Access-Control-Max-Age', '3600')
  }
  return headers
}

export function jsonResponse(request: Request, env: WorkerEnv, body: unknown, status = 200) {
  const headers = corsHeaders(request, env)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

export function emptyResponse(request: Request, env: WorkerEnv, status = 204) {
  return new Response(null, { status, headers: corsHeaders(request, env) })
}

export function errorResponse(request: Request, env: WorkerEnv, status: number, message: string) {
  return jsonResponse(request, env, { error: message }, status)
}
