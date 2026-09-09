import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

type FunctionClass =
  | 'READ_ONLY_BROWSER_RPC'
  | 'MUTATION_BROWSER_RPC'
  | 'BACKEND_ONLY_STORAGE_RPC'
  | 'INTERNAL_HELPER'
  | 'TRIGGER_FUNCTION'

interface FunctionEntry {
  name: string
  classification: FunctionClass
  identitySensitivity: 'direct' | 'transitive' | 'none'
  identityArguments: string
  returnType: string
  security: 'DEFINER' | 'INVOKER'
  fixedSearchPath: boolean
  mutationClass: 'M1' | 'M2' | 'M3' | 'M4' | null
  targetSchema: 'public' | 'app_private' | 'app_gateway'
}

interface Manifest {
  counts: Record<string, number>
  mutationCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number>
  functions: FunctionEntry[]
  policies: Array<{
    table: string
    name: string
    command: string
    roleTargets: string[]
    usingPresent: boolean
    withCheckPresent: boolean
    identitySensitive: boolean
  }>
  gatewayRoles: {
    login: string
    capabilityOwner: string
    callableExecuteCount: number
    tablePrivileges: Record<string, string[]>
  }
}

const manifest = JSON.parse(
  readFileSync('tests/fixtures/auth-gateway-db-manifest.json', 'utf8'),
) as Manifest
const stagedSql = readFileSync('database/staging/auth_gateway_identity_v1.sql', 'utf8')

const byClass = (classification: FunctionClass) =>
  manifest.functions.filter((entry) => entry.classification === classification)

test('canonical manifest freezes the complete final authorization surface', () => {
  assert.deepEqual(manifest.counts, {
    functions: 84,
    callableRpcs: 71,
    readOnlyBrowserRpcs: 31,
    mutationBrowserRpcs: 24,
    backendOnlyStorageRpcs: 16,
    internalHelpers: 12,
    triggerFunctions: 1,
    triggers: 7,
    rlsPolicies: 9,
  })
  assert.equal(manifest.functions.length, 84)
  assert.equal(new Set(manifest.functions.map(({ name }) => name)).size, 84)
  assert.equal(byClass('READ_ONLY_BROWSER_RPC').length, 31)
  assert.equal(byClass('MUTATION_BROWSER_RPC').length, 24)
  assert.equal(byClass('BACKEND_ONLY_STORAGE_RPC').length, 16)
  assert.equal(byClass('INTERNAL_HELPER').length, 12)
  assert.equal(byClass('TRIGGER_FUNCTION').length, 1)
  assert.equal(manifest.policies.length, 9)
  assert.ok(manifest.functions.every(({ fixedSearchPath }) => fixedSearchPath))
})

test('manifest freezes identity and mutation classifications', () => {
  assert.equal(manifest.functions.filter(({ identitySensitivity }) => identitySensitivity === 'direct').length, 76)
  assert.equal(manifest.functions.filter(({ identitySensitivity }) => identitySensitivity === 'transitive').length, 3)
  assert.equal(manifest.functions.filter(({ identitySensitivity }) => identitySensitivity !== 'none').length, 79)
  assert.deepEqual(manifest.mutationCounts, { M1: 0, M2: 17, M3: 7, M4: 8 })
  for (const mutationClass of ['M1', 'M2', 'M3', 'M4'] as const) {
    assert.equal(
      manifest.functions.filter((entry) => entry.mutationClass === mutationClass).length,
      manifest.mutationCounts[mutationClass],
    )
  }
})

test('staged SQL contains all migrated functions and no extension identity dependency', () => {
  assert.equal((stagedSql.match(/^CREATE OR REPLACE FUNCTION app_gateway\./gm) ?? []).length, 71)
  assert.equal((stagedSql.match(/^CREATE OR REPLACE FUNCTION app_private\./gm) ?? []).length, 13)
  assert.doesNotMatch(stagedSql, /auth\.(?:uid|user_id)\s*\(/)
  assert.doesNotMatch(stagedSql, /request\.jwt\.claims/)
  assert.doesNotMatch(stagedSql, /caller_user_id/i)
  assert.doesNotMatch(stagedSql, /GRANT\s+ALL(?:\s+PRIVILEGES)?\b/i)
  assert.doesNotMatch(stagedSql, /GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS/i)
  assert.doesNotMatch(stagedSql, /GRANT\s+ALL\s+TABLES/i)
})

test('all callable signatures are preserved and explicitly granted', () => {
  const callable = manifest.functions.filter((entry) => entry.targetSchema === 'app_gateway')
  assert.equal(callable.length, 71)
  for (const entry of callable) {
    const signature = `app_gateway.${entry.name}(${entry.identityArguments})`
    assert.ok(stagedSql.includes(`ALTER FUNCTION ${signature} OWNER TO dataclass_gateway_owner;`), signature)
    assert.ok(stagedSql.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO dataclass_gateway;`), signature)
  }
})

test('capability owner table commands are explicit and frozen', () => {
  assert.deepEqual(
    {
      login: manifest.gatewayRoles.login,
      capabilityOwner: manifest.gatewayRoles.capabilityOwner,
      callableExecuteCount: manifest.gatewayRoles.callableExecuteCount,
    },
    { login: 'dataclass_gateway', capabilityOwner: 'dataclass_gateway_owner', callableExecuteCount: 71 },
  )
  assert.equal(Object.keys(manifest.gatewayRoles.tablePrivileges).length, 15)
  for (const [table, privileges] of Object.entries(manifest.gatewayRoles.tablePrivileges)) {
    assert.ok(privileges.includes('SELECT'), `${table} must have its audited SELECT capability`)
    const mutations = privileges.filter((privilege) => privilege !== 'SELECT')
    if (mutations.length > 0) {
      assert.ok(
        stagedSql.includes(`GRANT ${mutations.join(', ')} ON public.${table} TO dataclass_gateway_owner;`),
        `${table} capability grant`,
      )
    }
  }
})

test('internal helpers stay private and Worker operations cannot become browser operations', () => {
  const helpers = byClass('INTERNAL_HELPER')
  assert.ok(helpers.every(({ targetSchema }) => targetSchema === 'app_private'))
  const workerOperations = byClass('BACKEND_ONLY_STORAGE_RPC')
  assert.equal(workerOperations.length, 16)
  assert.ok(workerOperations.every(({ classification }) => classification !== 'READ_ONLY_BROWSER_RPC'))
  assert.ok(workerOperations.every(({ classification }) => classification !== 'MUTATION_BROWSER_RPC'))
})

test('the nine policy definitions remain a distinct special-migration guard', () => {
  assert.equal(new Set(manifest.policies.map(({ table, name }) => `${table}.${name}`)).size, 9)
  assert.ok(manifest.policies.every(({ command }) => command === 'SELECT'))
  assert.ok(manifest.policies.every(({ roleTargets }) => roleTargets.length === 1 && roleTargets[0] === 'authenticated'))
  assert.ok(manifest.policies.every(({ usingPresent, withCheckPresent, identitySensitive }) =>
    usingPresent && !withCheckPresent && identitySensitive,
  ))
  assert.equal((stagedSql.match(/^-- [a-z_]+\.[a-z_]+: USING \(/gm) ?? []).length, 9)
  assert.equal((stagedSql.match(/^CREATE POLICY app_gateway_capability_/gm) ?? []).length, 15)
})
