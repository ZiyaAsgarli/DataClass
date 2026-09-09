import { GatewayError } from './errors.ts'
import type { GatewayOperationDefinition, GatewayResultColumn } from './types.ts'

function normalizeBigint(value: unknown) {
  if (value === null) return null
  if (typeof value === 'bigint') {
    const converted = Number(value)
    if (!Number.isSafeInteger(converted)) throw new GatewayError('INTERNAL')
    return converted
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const converted = Number(value)
    if (!Number.isSafeInteger(converted)) throw new GatewayError('INTERNAL')
    return converted
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  throw new GatewayError('INTERNAL')
}

function normalizeTimestamp(value: unknown) {
  if (value === null) return null
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) throw new GatewayError('INTERNAL')
  return date.toISOString()
}

function normalizeDate(value: unknown) {
  if (value === null) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  throw new GatewayError('INTERNAL')
}

function normalizeColumn(value: unknown, column: GatewayResultColumn) {
  if (column.type === 'bigint') return normalizeBigint(value)
  if (column.type === 'timestamp with time zone' || column.type === 'timestamp without time zone') {
    return normalizeTimestamp(value)
  }
  if (column.type === 'date') return normalizeDate(value)
  return value
}

function normalizeRow(row: Record<string, unknown>, columns: readonly GatewayResultColumn[]) {
  const normalized = { ...row }
  for (const column of columns) {
    if (Object.hasOwn(normalized, column.name)) {
      normalized[column.name] = normalizeColumn(normalized[column.name], column)
    }
  }
  return normalized
}

export function normalizeGatewayResult(
  definition: GatewayOperationDefinition,
  rows: readonly Record<string, unknown>[],
) {
  if (definition.resultKind === 'VOID') return null
  if (definition.resultKind === 'SCALAR') {
    if (rows.length === 0) return null
    return normalizeColumn(rows[0]?.value, definition.resultColumns[0] ?? { name: 'value', type: definition.returnType })
  }
  return rows.map((row) => normalizeRow(row, definition.resultColumns))
}
