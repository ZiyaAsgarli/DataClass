import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

interface RpcCall {
  operation: string
  params?: Record<string, unknown>
}

interface ClassServiceModule {
  listTeacherClasses(): Promise<unknown[]>
  listStudentClasses(): Promise<unknown[]>
  getClassOverview(classId: string): Promise<Record<string, unknown>>
  getMyStudentClassOverview(classId: string): Promise<Record<string, unknown>>
  getClassStudents(classId: string): Promise<unknown[]>
  getClassInvitations(classId: string): Promise<unknown[]>
  getClassInstructors(classId: string): Promise<unknown[]>
  getMyStudentClassInstructors(classId: string): Promise<unknown[]>
  createClass(name: string, description: string): Promise<string>
  updateClass(classId: string, name: string, description: string, status: string): Promise<void>
  inviteStudents(classId: string, emails: string[]): Promise<unknown[]>
  revokeInvitation(invitationId: string): Promise<void>
  addInstructor(classId: string, email: string): Promise<string>
  removeInstructor(classId: string, teacherId: string): Promise<void>
}

const gatewayCalls: RpcCall[] = []
const dataApiCalls: RpcCall[] = []
const gatewayResponses = new Map<string, unknown>()
const dataApiResponses = new Map<string, unknown>()
let gatewayFailure: Error | null = null

async function loadClassService() {
  const sourceUrl = new URL('../src/services/classService.ts', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const executable = source
    .replace("import { neonClient } from '@/lib/neon'", `const { neonClient, callGatewayRpc } = globalThis.__classServiceDeps`)
    .replace("import { callGatewayRpc } from '@/lib/rpc'", '')
    .replace(/import type \{[\s\S]*?\} from '@\/types'\r?\n/, '')

  Object.assign(globalThis, {
    __classServiceDeps: {
      callGatewayRpc: async (operation: string, params?: Record<string, unknown>) => {
        gatewayCalls.push({ operation, params })
        if (gatewayFailure) throw gatewayFailure
        return gatewayResponses.get(operation)
      },
      neonClient: {
        rpc: async (operation: string, params?: Record<string, unknown>) => {
          dataApiCalls.push({ operation, params })
          return { data: dataApiResponses.get(operation), error: null }
        },
      },
    },
  })

  const directory = await mkdtemp(join(tmpdir(), 'dataclass-class-service-'))
  const modulePath = join(directory, 'classService.ts')
  await writeFile(modulePath, executable)
  try {
    return await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`) as ClassServiceModule
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const service = await loadClassService()

function reset() {
  gatewayCalls.length = 0
  dataApiCalls.length = 0
  gatewayResponses.clear()
  dataApiResponses.clear()
  gatewayFailure = null
}

const classRow = {
  id: 'synthetic-class', name: 'Synthetic class', description: null, status: 'active',
  teacher_role: 'owner', owner_id: 'synthetic-owner', owner_name: 'Synthetic owner',
  owner_email: 'owner.invalid', current_access: 'owner', student_count: '2',
  instructor_count: '1', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

test('all eight classService reads use the gateway with exact keys and parameters', async () => {
  reset()
  gatewayResponses.set('list_my_teacher_classes', [classRow])
  gatewayResponses.set('list_my_student_classes', [classRow])
  gatewayResponses.set('get_class_overview', [classRow])
  gatewayResponses.set('get_my_student_class_overview', [classRow])
  gatewayResponses.set('get_class_students', [{
    membership_id: 'membership', student_id: 'student', full_name: 'Student', email: 'student.invalid',
    membership_status: 'active', joined_at: '2026-01-03T00:00:00.000Z',
  }])
  gatewayResponses.set('get_class_invitations', null)
  gatewayResponses.set('get_class_instructors', [{
    relationship_id: 'relationship', teacher_id: 'teacher', full_name: 'Teacher', email: 'teacher.invalid',
    avatar_url: null, teacher_role: 'instructor', created_at: '2026-01-03T00:00:00.000Z',
  }])
  gatewayResponses.set('get_my_student_class_instructors', [])

  assert.equal((await service.listTeacherClasses())[0]?.studentCount, 2)
  assert.equal((await service.listStudentClasses())[0]?.name, 'Synthetic class')
  assert.equal((await service.getClassOverview('class-a')).currentAccess, 'owner')
  assert.equal((await service.getMyStudentClassOverview('class-a')).ownerEmail, '')
  assert.equal((await service.getClassStudents('class-a'))[0]?.status, 'active')
  assert.deepEqual(await service.getClassInvitations('class-a'), [])
  assert.equal((await service.getClassInstructors('class-a'))[0]?.role, 'instructor')
  assert.deepEqual(await service.getMyStudentClassInstructors('class-a'), [])

  assert.deepEqual(gatewayCalls, [
    { operation: 'list_my_teacher_classes', params: undefined },
    { operation: 'list_my_student_classes', params: undefined },
    { operation: 'get_class_overview', params: { target_class_id: 'class-a' } },
    { operation: 'get_my_student_class_overview', params: { target_class_id: 'class-a' } },
    { operation: 'get_class_students', params: { target_class_id: 'class-a' } },
    { operation: 'get_class_invitations', params: { target_class_id: 'class-a' } },
    { operation: 'get_class_instructors', params: { target_class_id: 'class-a' } },
    { operation: 'get_my_student_class_instructors', params: { target_class_id: 'class-a' } },
  ])
  assert.equal(dataApiCalls.length, 0)
})

test('gateway errors propagate without a Data API fallback', async () => {
  reset()
  const expected = new Error('normalized gateway failure')
  gatewayFailure = expected
  await assert.rejects(service.getClassStudents('class-a'), (error) => error === expected)
  assert.equal(gatewayCalls.length, 1)
  assert.equal(dataApiCalls.length, 0)
})

test('all six classService mutations remain on the Data API transport', async () => {
  reset()
  dataApiResponses.set('create_class', [{ class_id: 'created-class' }])
  dataApiResponses.set('update_owned_class', [])
  dataApiResponses.set('create_class_invitations', [{ email: 'student.invalid', outcome: 'created' }])
  dataApiResponses.set('revoke_class_invitation', [])
  dataApiResponses.set('add_class_instructor_by_email', [{ outcome: 'added' }])
  dataApiResponses.set('remove_class_instructor', [])

  assert.equal(await service.createClass('Class', ''), 'created-class')
  await service.updateClass('class-a', 'Class', '', 'active')
  await service.inviteStudents('class-a', ['student.invalid'])
  await service.revokeInvitation('invitation-a')
  assert.equal(await service.addInstructor('class-a', 'teacher.invalid'), 'added')
  await service.removeInstructor('class-a', 'teacher-a')

  assert.deepEqual(dataApiCalls, [
    { operation: 'create_class', params: { class_name: 'Class', class_description: null } },
    { operation: 'update_owned_class', params: {
      target_class_id: 'class-a', class_name: 'Class', class_description: null, class_status: 'active',
    } },
    { operation: 'create_class_invitations', params: {
      target_class_id: 'class-a', invitation_emails: ['student.invalid'],
    } },
    { operation: 'revoke_class_invitation', params: { target_invitation_id: 'invitation-a' } },
    { operation: 'add_class_instructor_by_email', params: {
      target_class_id: 'class-a', teacher_email: 'teacher.invalid',
    } },
    { operation: 'remove_class_instructor', params: {
      target_class_id: 'class-a', target_teacher_id: 'teacher-a',
    } },
  ])
  assert.equal(gatewayCalls.length, 0)
})

test('classService contains no storage operation', async () => {
  const source = await readFile(new URL('../src/services/classService.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /storage|resource|upload|download|finalize/i)
})
