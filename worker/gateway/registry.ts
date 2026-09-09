import { GatewayError } from './errors.ts'
import { GATEWAY_OPERATION_ROWS } from './registryData.ts'
import type {
  GatewayOperationDefinition,
  GatewayParameterDefinition,
  GatewayParameterType,
  GatewayResultColumn,
} from './types.ts'

const IDENTIFIER = /^[a-z][a-z0-9_]*$/
const PARAMETER_TYPES = new Set<GatewayParameterType>([
  'uuid', 'text', 'boolean', 'integer', 'bigint', 'date', 'timestamp with time zone', 'text[]',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTEGER_PATTERN = /^-?\d+$/

function splitList(value: string) {
  return value ? value.split(/,\s+/) : []
}

function parseSignature(signature: string, argumentsWithDefaults: string) {
  const defaultParts = splitList(argumentsWithDefaults)
  return splitList(signature).map((part, index): GatewayParameterDefinition => {
    const match = part.match(/^([a-z][a-z0-9_]*)\s+(.+)$/)
    if (!match) throw new Error(`Invalid checked-in gateway signature: ${part}`)
    const [, name, rawType] = match
    const type = rawType as GatewayParameterType
    if (!IDENTIFIER.test(name) || !PARAMETER_TYPES.has(type)) {
      throw new Error(`Unsupported checked-in gateway parameter: ${part}`)
    }
    const defaultMatch = defaultParts[index]?.match(/\s+DEFAULT\s+(.+)$/i)
    return Object.freeze({
      name,
      type,
      required: !defaultMatch,
      defaultSql: defaultMatch?.[1] ?? null,
    })
  })
}

function parseResult(returnType: string) {
  if (returnType === 'void') {
    return { kind: 'VOID' as const, columns: [] as GatewayResultColumn[] }
  }
  const table = returnType.match(/^TABLE\((.*)\)$/)
  if (!table) {
    return { kind: 'SCALAR' as const, columns: [{ name: 'value', type: returnType }] }
  }
  const columns = splitList(table[1]).map((part): GatewayResultColumn => {
    const match = part.match(/^([a-z][a-z0-9_]*)\s+(.+)$/)
    if (!match) throw new Error(`Invalid checked-in gateway return column: ${part}`)
    return Object.freeze({ name: match[1], type: match[2] })
  })
  return { kind: 'ROWS' as const, columns }
}

function checkedIdentifier(value: string) {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid checked-in SQL identifier: ${value}`)
  return `"${value}"`
}

function createSql(functionName: string, resultKind: 'ROWS' | 'SCALAR' | 'VOID') {
  const qualifiedFunction = `${checkedIdentifier('app_gateway')}.${checkedIdentifier(functionName)}`
  return (parameters: readonly GatewayParameterDefinition[]) => {
    const argumentsSql = parameters
      .map((parameter, index) => `${checkedIdentifier(parameter.name)} => $${index + 1}::${parameter.type}`)
      .join(', ')
    if (resultKind === 'ROWS') return `SELECT * FROM ${qualifiedFunction}(${argumentsSql})`
    return `SELECT ${qualifiedFunction}(${argumentsSql}) AS value`
  }
}

const entries = GATEWAY_OPERATION_ROWS.map((row): readonly [string, GatewayOperationDefinition] => {
  if (!IDENTIFIER.test(row.key)) throw new Error(`Invalid checked-in operation key: ${row.key}`)
  const parameters = parseSignature(row.signature, row.arguments)
  const result = parseResult(row.returnType)
  const definition: GatewayOperationDefinition = Object.freeze({
    key: row.key,
    dbFunction: `app_gateway.${row.key}`,
    signature: `app_gateway.${row.key}(${row.signature})`,
    parameters: Object.freeze(parameters),
    returnType: row.returnType,
    resultKind: result.kind,
    resultColumns: Object.freeze(result.columns),
    exposure: row.exposure,
    access: row.access,
    mutationClass: row.mutationClass,
    authRequired: true,
    deadlineClass: row.deadlineClass,
    retryPolicy: 'NONE',
    sql: createSql(row.key, result.kind),
  })
  return [row.key, definition]
})

if (new Set(entries.map(([key]) => key)).size !== entries.length) {
  throw new Error('Duplicate checked-in gateway operation key.')
}

export const GATEWAY_OPERATION_REGISTRY = Object.freeze(Object.fromEntries(entries)) as
  Readonly<Record<string, GatewayOperationDefinition>>
export const GATEWAY_OPERATION_NAMES = Object.freeze(entries.map(([key]) => key))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validateValue(parameter: GatewayParameterDefinition, value: unknown) {
  if (value === null) return null
  switch (parameter.type) {
    case 'uuid':
      if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new GatewayError('VALIDATION')
      return value.toLowerCase()
    case 'text':
      if (typeof value !== 'string') throw new GatewayError('VALIDATION')
      return value
    case 'boolean':
      if (typeof value !== 'boolean') throw new GatewayError('VALIDATION')
      return value
    case 'integer':
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new GatewayError('VALIDATION')
      }
      return value
    case 'bigint':
      if (typeof value === 'number' && Number.isSafeInteger(value)) return value
      if (typeof value === 'string' && INTEGER_PATTERN.test(value)) return value
      throw new GatewayError('VALIDATION')
    case 'date':
      if (typeof value !== 'string' || !validDate(value)) throw new GatewayError('VALIDATION')
      return value
    case 'timestamp with time zone':
      if (typeof value !== 'string' || !/Z$|[+-]\d{2}:\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        throw new GatewayError('VALIDATION')
      }
      return value
    case 'text[]':
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new GatewayError('VALIDATION')
      }
      return value
  }
}

export function parseGatewayRequest(value: unknown) {
  if (!isRecord(value)) throw new GatewayError('VALIDATION')
  const requestKeys = Object.keys(value).sort()
  if (requestKeys.length !== 2 || requestKeys[0] !== 'operation' || requestKeys[1] !== 'params') {
    throw new GatewayError('VALIDATION')
  }
  if (typeof value.operation !== 'string' || !isRecord(value.params)) throw new GatewayError('VALIDATION')
  const definition = GATEWAY_OPERATION_REGISTRY[value.operation]
  if (!definition || definition.exposure !== 'BROWSER') throw new GatewayError('NOT_FOUND')
  return { definition, invocation: validateGatewayParameters(definition, value.params) }
}

export function validateGatewayParameters(
  definition: GatewayOperationDefinition,
  params: Readonly<Record<string, unknown>>,
) {
  const known = new Set(definition.parameters.map(({ name }) => name))
  if (Object.keys(params).some((key) => !known.has(key))) throw new GatewayError('VALIDATION')
  const included: GatewayParameterDefinition[] = []
  const values: unknown[] = []
  for (const parameter of definition.parameters) {
    if (!Object.hasOwn(params, parameter.name)) {
      if (parameter.required) throw new GatewayError('VALIDATION')
      continue
    }
    included.push(parameter)
    values.push(validateValue(parameter, params[parameter.name]))
  }
  return Object.freeze({
    definition,
    sql: definition.sql(included),
    values: Object.freeze(values),
    includedParameters: Object.freeze(included),
  })
}

export function resolveInternalGatewayOperation(operation: string, params: Readonly<Record<string, unknown>>) {
  const definition = GATEWAY_OPERATION_REGISTRY[operation]
  if (!definition || definition.exposure !== 'WORKER_INTERNAL') throw new GatewayError('NOT_FOUND')
  return validateGatewayParameters(definition, params)
}
