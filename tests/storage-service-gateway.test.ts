import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { parseGatewayRequest } from '../worker/gateway/registry.ts'

interface GatewayCall {
  operation: string
  params: Record<string, unknown> | undefined
}

interface StorageServiceModule {
  listTeacherLessonResources(id: string): Promise<Array<Record<string, unknown>>>
  listStudentLessonResources(id: string): Promise<Array<Record<string, unknown>>>
  listTeacherAssignmentResources(id: string): Promise<Array<Record<string, unknown>>>
  listStudentAssignmentResources(id: string): Promise<Array<Record<string, unknown>>>
}

const gatewayCalls: GatewayCall[] = []
const gatewayResponses = new Map<string, unknown>()
let gatewayFailure: Error | null = null

async function loadStorageService() {
  const source = await readFile(new URL('../src/services/storageService.ts', import.meta.url), 'utf8')
  const executable = source
    .replace("import { getCurrentNeonAuthToken } from '@/lib/neon'", 'const { getCurrentNeonAuthToken } = globalThis.__storageServiceDeps')
    .replace("import { callGatewayRpc } from '@/lib/rpc'", 'const { callGatewayRpc } = globalThis.__storageServiceDeps')
    .replace("import type { LessonResourceRecord } from '@/types'", 'type LessonResourceRecord = Record<string, unknown>')
    .replace('import.meta.env.VITE_STORAGE_API_URL', "'https://storage.invalid'")
  Object.assign(globalThis, {
    __storageServiceDeps: {
      getCurrentNeonAuthToken: async () => 'synthetic-token',
      callGatewayRpc: async (operation: string, params?: Record<string, unknown>) => {
        gatewayCalls.push({ operation, params })
        if (gatewayFailure) throw gatewayFailure
        return gatewayResponses.get(operation)
      },
    },
  })
  const directory = await mkdtemp(join(tmpdir(), 'dataclass-storage-service-'))
  const modulePath = join(directory, 'storageService.ts')
  await writeFile(modulePath, executable)
  try {
    return await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`) as StorageServiceModule
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const service = await loadStorageService()

function reset() {
  gatewayCalls.length = 0
  gatewayResponses.clear()
  gatewayFailure = null
}

const row = {
  id: 'resource-a', title: 'Workbook', resource_kind: 'xlsx', file_name: 'workbook.xlsx',
  file_size_bytes: '64', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  resource_position: '2', uploaded_at: '2026-09-11T00:00:00.000Z', can_manage: true,
}

test('all four resource metadata reads use exact browser gateway operations and parameters', async () => {
  reset()
  for (const operation of [
    'list_teacher_lesson_resources', 'list_student_lesson_resources',
    'list_teacher_assignment_resources', 'list_student_assignment_resources',
  ]) gatewayResponses.set(operation, [row])

  const teacherLesson = await service.listTeacherLessonResources('lesson-a')
  const studentLesson = await service.listStudentLessonResources('lesson-a')
  const teacherAssignment = await service.listTeacherAssignmentResources('assignment-a')
  const studentAssignment = await service.listStudentAssignmentResources('assignment-a')

  assert.deepEqual(gatewayCalls, [
    { operation: 'list_teacher_lesson_resources', params: { target_lesson_id: 'lesson-a' } },
    { operation: 'list_student_lesson_resources', params: { target_lesson_id: 'lesson-a' } },
    { operation: 'list_teacher_assignment_resources', params: { target_assignment_id: 'assignment-a' } },
    { operation: 'list_student_assignment_resources', params: { target_assignment_id: 'assignment-a' } },
  ])
  for (const result of [teacherLesson, studentLesson, teacherAssignment, studentAssignment]) {
    assert.equal(result[0]?.fileSizeBytes, 64)
    assert.equal(result[0]?.position, 2)
    assert.equal(result[0]?.canManage, true)
  }
})

test('null and empty gateway results preserve the empty resource-list contract', async () => {
  reset()
  gatewayResponses.set('list_teacher_lesson_resources', null)
  gatewayResponses.set('list_student_lesson_resources', [])
  assert.deepEqual(await service.listTeacherLessonResources('lesson-a'), [])
  assert.deepEqual(await service.listStudentLessonResources('lesson-a'), [])
})

test('gateway errors execute once and never fall back to Data API', async () => {
  reset()
  gatewayFailure = new Error('normalized gateway failure')
  await assert.rejects(service.listTeacherAssignmentResources('assignment-a'), /normalized gateway failure/)
  assert.deepEqual(gatewayCalls, [{
    operation: 'list_teacher_assignment_resources', params: { target_assignment_id: 'assignment-a' },
  }])
})

test('internal storage operations remain unavailable through browser rpc', () => {
  for (const operation of [
    'prepare_lesson_resource_upload', 'finalize_lesson_resource_upload',
    'authorize_lesson_resource_download', 'delete_lesson_resource_metadata',
  ]) assert.throws(() => parseGatewayRequest({ operation, params: {} }))
})

test('storage orchestration remains on Worker routes and frontend source has no Data API transport', async () => {
  const source = await readFile(new URL('../src/services/storageService.ts', import.meta.url), 'utf8')
  assert.equal(source.match(/callGatewayRpc<unknown>/g)?.length, 1)
  assert.doesNotMatch(source, /neonClient|rest\/v1|apirest|runtime fallback|retry/i)
  assert.match(source, /uploadPrivateFile\('\/v1\/resources'/)
  assert.match(source, /uploadPrivateFile\('\/v1\/assignment-resources'/)
  assert.match(source, /uploadPrivateFile\('\/v1\/submission-files'/)
  assert.match(source, /`\$\{endpoint\}\/upload-intent`/)
  assert.match(source, /await putFile\(intent, file, onProgress\)[\s\S]*\/finalize/)
})
