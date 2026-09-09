export type GatewayExposure = 'BROWSER' | 'WORKER_INTERNAL'
export type GatewayAccess = 'READ' | 'MUTATION'
export type MutationClass = 'M1' | 'M2' | 'M3' | 'M4'
export type GatewayResultKind = 'ROWS' | 'SCALAR' | 'VOID'
export type GatewayDeadlineClass = 'READ' | 'MUTATION' | 'STORAGE'
export type GatewayParameterType =
  | 'uuid'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'bigint'
  | 'date'
  | 'timestamp with time zone'
  | 'text[]'

export interface GatewayParameterDefinition {
  readonly name: string
  readonly type: GatewayParameterType
  readonly required: boolean
  readonly defaultSql: string | null
}

export interface GatewayResultColumn {
  readonly name: string
  readonly type: string
}

export interface GatewayOperationDefinition {
  readonly key: string
  readonly dbFunction: string
  readonly signature: string
  readonly parameters: readonly GatewayParameterDefinition[]
  readonly returnType: string
  readonly resultKind: GatewayResultKind
  readonly resultColumns: readonly GatewayResultColumn[]
  readonly exposure: GatewayExposure
  readonly access: GatewayAccess
  readonly mutationClass: MutationClass | null
  readonly authRequired: true
  readonly deadlineClass: GatewayDeadlineClass
  readonly retryPolicy: 'NONE'
  readonly sql: (includedParameters: readonly GatewayParameterDefinition[]) => string
}

export interface GatewayOperationRequest {
  readonly operation: string
  readonly params: Readonly<Record<string, unknown>>
}

export interface VerifiedGatewayActor {
  readonly actorId: string
}

export interface HyperdriveBinding {
  readonly connectionString: string
}

export interface GatewayEnv {
  GATEWAY_ENABLED: string
  GATEWAY_APP_ORIGIN: string
  GATEWAY_NEON_JWT_ISSUER: string
  GATEWAY_NEON_JWT_AUDIENCE: string
  GATEWAY_NEON_JWKS_URL: string
  HYPERDRIVE: HyperdriveBinding
}
