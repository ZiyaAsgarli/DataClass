import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifyDatabaseError, GatewayError, gatewayErrorBody } from '../worker/gateway/errors.ts'
import { normalizeGatewayResult } from '../worker/gateway/normalize.ts'
import {
  GATEWAY_OPERATION_NAMES,
  GATEWAY_OPERATION_REGISTRY,
  parseGatewayRequest,
  resolveInternalGatewayOperation,
  validateGatewayParameters,
} from '../worker/gateway/registry.ts'
import type { GatewayOperationDefinition } from '../worker/gateway/types.ts'

interface ManifestFunction {
  name: string
  classification: string
  identityArguments: string
  returnType: string
  mutationClass: 'M1' | 'M2' | 'M3' | 'M4' | null
  targetSchema: string
}

const manifest = JSON.parse(readFileSync('tests/fixtures/auth-gateway-db-manifest.json', 'utf8')) as {
  functions: ManifestFunction[]
  mutationCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number>
}
const callable = manifest.functions.filter(({ targetSchema }) => targetSchema === 'app_gateway')

test('registry has exact 71/55/16 manifest parity', () => {
  const definitions = Object.values(GATEWAY_OPERATION_REGISTRY)
  assert.equal(definitions.length, 71)
  assert.equal(GATEWAY_OPERATION_NAMES.length, 71)
  assert.equal(definitions.filter(({ exposure }) => exposure === 'BROWSER').length, 55)
  assert.equal(definitions.filter(({ exposure }) => exposure === 'WORKER_INTERNAL').length, 16)
  assert.deepEqual([...GATEWAY_OPERATION_NAMES].sort(), callable.map(({ name }) => name).sort())
  assert.equal(new Set(definitions.map(({ signature }) => signature)).size, 71)
  for (const entry of callable) {
    const definition = GATEWAY_OPERATION_REGISTRY[entry.name]
    assert.ok(definition, entry.name)
    assert.equal(definition.signature, `app_gateway.${entry.name}(${entry.identityArguments})`)
    assert.equal(definition.returnType, entry.returnType)
    assert.equal(definition.mutationClass, entry.mutationClass)
    const expectedExposure = entry.classification === 'BACKEND_ONLY_STORAGE_RPC'
      ? 'WORKER_INTERNAL'
      : 'BROWSER'
    assert.equal(definition.exposure, expectedExposure)
  }
})

test('mutation metadata and storage exposure are frozen', () => {
  const definitions = Object.values(GATEWAY_OPERATION_REGISTRY)
  for (const mutationClass of ['M1', 'M2', 'M3', 'M4'] as const) {
    assert.equal(
      definitions.filter((entry) => entry.mutationClass === mutationClass).length,
      manifest.mutationCounts[mutationClass],
    )
  }
  assert.ok(definitions.every(({ retryPolicy }) => retryPolicy === 'NONE'))
  assert.ok(definitions.filter(({ mutationClass }) => mutationClass === 'M4')
    .every(({ exposure }) => exposure === 'WORKER_INTERNAL'))
})

test('all 71 SQL statements use only checked-in identifiers and positional values', () => {
  for (const definition of Object.values(GATEWAY_OPERATION_REGISTRY)) {
    const params = Object.fromEntries(definition.parameters.map((parameter) => [parameter.name, sample(parameter.type)]))
    const invocation = validateGatewayParameters(definition, params)
    assert.match(invocation.sql, /^SELECT (?:\* FROM )?"app_gateway"\."[a-z][a-z0-9_]*"\(/)
    assert.doesNotMatch(invocation.sql, /;|--|\/\*/)
    assert.equal((invocation.sql.match(/\$\d+/g) ?? []).length, definition.parameters.length)
    assert.equal(invocation.values.length, definition.parameters.length)
    for (const parameter of definition.parameters) {
      assert.match(invocation.sql, new RegExp(`"${parameter.name}" => \\$\\d+::`))
    }
  }
})

test('browser parser rejects internal, unknown, identity, and SQL-like input', () => {
  const internal = Object.values(GATEWAY_OPERATION_REGISTRY).find(({ exposure }) => exposure === 'WORKER_INTERNAL')
  assert.ok(internal)
  assert.throws(() => parseGatewayRequest({ operation: internal.key, params: {} }), GatewayError)
  for (const value of [
    { operation: 'unknown', params: {} },
    { operation: 'list_my_student_classes; DROP TABLE classes', params: {} },
    { operation: 'list_my_student_classes', params: { user_id: '10000000-0000-4000-8000-000000000001' } },
    { operation: 'list_my_student_classes', params: { sql: 'SELECT current_user' } },
  ]) assert.throws(() => parseGatewayRequest(value), GatewayError)
})

test('internal resolver accepts only the 16 internal operations', () => {
  const internal = Object.values(GATEWAY_OPERATION_REGISTRY).filter(({ exposure }) => exposure === 'WORKER_INTERNAL')
  const browser = Object.values(GATEWAY_OPERATION_REGISTRY).find(({ exposure }) => exposure === 'BROWSER')
  assert.equal(internal.length, 16)
  assert.ok(browser)
  for (const definition of internal) {
    const params = Object.fromEntries(definition.parameters.map((parameter) => [parameter.name, sample(parameter.type)]))
    assert.equal(resolveInternalGatewayOperation(definition.key, params).definition, definition)
  }
  assert.throws(() => resolveInternalGatewayOperation(browser.key, {}), GatewayError)
})

test('argument validation handles UUID, scalar, array, date, timestamp, null, and defaults', () => {
  const createLesson = GATEWAY_OPERATION_REGISTRY.create_lesson
  const minimal = validateGatewayParameters(createLesson, {
    target_module_id: '10000000-0000-4000-8000-000000000001',
    lesson_title: 'Lesson',
  })
  assert.equal(minimal.values.length, 2)
  assert.doesNotMatch(minimal.sql, /target_lesson_date/)
  const invitations = GATEWAY_OPERATION_REGISTRY.create_class_invitations
  assert.equal(validateGatewayParameters(invitations, {
    target_class_id: '10000000-0000-4000-8000-000000000001',
    invitation_emails: ['synthetic-address'],
  }).values.length, 2)
  assert.throws(() => validateGatewayParameters(createLesson, {
    target_module_id: 'not-uuid', lesson_title: 'Lesson', target_lesson_date: '2026-02-30',
  }), GatewayError)
  assert.throws(() => validateGatewayParameters(invitations, {
    target_class_id: '10000000-0000-4000-8000-000000000001', invitation_emails: ['ok', 7],
  }), GatewayError)
})

test('normalization preserves Data API-compatible shapes', () => {
  const rowDefinition = GATEWAY_OPERATION_REGISTRY.get_class_overview
  const rows = normalizeGatewayResult(rowDefinition, [{
    id: '10000000-0000-4000-8000-000000000001',
    student_count: '7', instructor_count: 2n,
    created_at: new Date('2026-09-06T10:20:30.000Z'),
    updated_at: '2026-09-06T11:20:30+00:00',
  }])
  assert.deepEqual(rows, [{
    id: '10000000-0000-4000-8000-000000000001',
    student_count: 7, instructor_count: 2,
    created_at: '2026-09-06T10:20:30.000Z',
    updated_at: '2026-09-06T11:20:30.000Z',
  }])
  assert.equal(normalizeGatewayResult(GATEWAY_OPERATION_REGISTRY.create_assignment, [{
    value: '10000000-0000-4000-8000-000000000001',
  }]), '10000000-0000-4000-8000-000000000001')
  assert.equal(normalizeGatewayResult(GATEWAY_OPERATION_REGISTRY.remove_lesson_video, [{ value: '' }]), null)
  assert.deepEqual(normalizeGatewayResult(rowDefinition, []), [])
  const jsonDefinition = syntheticDefinition('ROWS', [{ name: 'payload', type: 'jsonb' }])
  assert.deepEqual(normalizeGatewayResult(jsonDefinition, [{ payload: { ok: true, values: [1, null] } }]), [
    { payload: { ok: true, values: [1, null] } },
  ])
})

test('SQLSTATE categories have stable sanitized bodies', () => {
  const cases: Array<[string | undefined, string, number]> = [
    ['42501', 'FORBIDDEN', 403], ['P0002', 'NOT_FOUND', 404], ['23505', 'CONFLICT', 409],
    ['23514', 'VALIDATION', 400], ['P0001', 'VALIDATION', 400], ['08006', 'DATABASE_UNAVAILABLE', 503],
    ['XX000', 'INTERNAL', 500], [undefined, 'DATABASE_UNAVAILABLE', 503],
  ]
  for (const [code, expected, status] of cases) {
    const error = classifyDatabaseError(code ? { code, message: 'private database detail' } : new Error('private detail'))
    assert.equal(error.code, expected)
    assert.equal(error.status, status)
    const body = JSON.stringify(gatewayErrorBody(error))
    assert.doesNotMatch(body, /private|database detail|XX000|08006/)
  }
})

function sample(type: string): unknown {
  if (type === 'uuid') return '10000000-0000-4000-8000-000000000001'
  if (type === 'text') return 'value'
  if (type === 'boolean') return true
  if (type === 'integer' || type === 'bigint') return 1
  if (type === 'date') return '2026-09-06'
  if (type === 'timestamp with time zone') return '2026-09-06T10:20:30.000Z'
  if (type === 'text[]') return ['value']
  throw new Error(`No sample for ${type}`)
}

function syntheticDefinition(
  resultKind: GatewayOperationDefinition['resultKind'],
  resultColumns: GatewayOperationDefinition['resultColumns'],
): GatewayOperationDefinition {
  return {
    key: 'synthetic', dbFunction: 'app_gateway.synthetic', signature: 'app_gateway.synthetic()',
    parameters: [], returnType: 'jsonb', resultKind, resultColumns, exposure: 'BROWSER', access: 'READ',
    mutationClass: null, authRequired: true, deadlineClass: 'READ', retryPolicy: 'NONE', sql: () => 'SELECT 1',
  }
}
