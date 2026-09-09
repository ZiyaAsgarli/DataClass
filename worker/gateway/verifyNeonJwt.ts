import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'
import { GatewayError } from './errors.ts'
import type { VerifiedGatewayActor } from './types.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface NeonJwtVerificationConfig {
  issuer: string
  audience: string
  jwksUrl: string
}

interface VerificationOptions {
  keySet?: JWTVerifyGetKey
}

interface CachedRemoteKeySet {
  url: string
  keySet: JWTVerifyGetKey
}

let cachedRemoteKeySet: CachedRemoteKeySet | null = null

function authenticationError() {
  return new GatewayError('AUTH_REQUIRED')
}

function normalizeIssuer(value: string) {
  let issuer: URL
  try {
    issuer = new URL(value)
  } catch {
    throw authenticationError()
  }
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw authenticationError()
  }
  return issuer.toString().replace(/\/$/, '')
}

export function normalizeJwksUrl(value: string) {
  let jwksUrl: URL
  try {
    jwksUrl = new URL(value)
  } catch {
    throw authenticationError()
  }
  if (jwksUrl.protocol !== 'https:' || jwksUrl.username || jwksUrl.password || jwksUrl.search || jwksUrl.hash) {
    throw authenticationError()
  }
  return jwksUrl
}

function remoteKeySet(jwksUrl: URL) {
  const url = jwksUrl.toString()
  if (cachedRemoteKeySet?.url !== url) {
    cachedRemoteKeySet = {
      url,
      keySet: createRemoteJWKSet(jwksUrl, {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      }),
    }
  }
  return cachedRemoteKeySet.keySet
}

export async function verifyNeonJwt(
  token: string,
  config: NeonJwtVerificationConfig,
  options: VerificationOptions = {},
): Promise<VerifiedGatewayActor> {
  if (!token || token.length > 8_192 || !config.audience.trim()) throw authenticationError()
  const issuer = normalizeIssuer(config.issuer)
  const keySet = options.keySet ?? remoteKeySet(normalizeJwksUrl(config.jwksUrl))
  try {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ['EdDSA'],
      issuer,
      audience: config.audience,
      requiredClaims: ['iss', 'aud', 'sub', 'exp'],
      clockTolerance: 5,
    })
    if (typeof payload.sub !== 'string' || !UUID_PATTERN.test(payload.sub)) throw authenticationError()
    return { actorId: payload.sub.toLowerCase() }
  } catch (error) {
    if (error instanceof GatewayError) throw error
    throw authenticationError()
  }
}
