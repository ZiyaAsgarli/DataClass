import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { GATEWAY_OPERATION_ROWS } from '../worker/gateway/registryData.ts'

interface RpcCall {
  operation: string
  params?: Record<string, unknown>
}

interface AssignmentServiceModule {
  listTeacherAssignments(): Promise<unknown[]>
  listStudentAssignments(): Promise<unknown[]>
  getTeacherAssignment(id: string): Promise<Record<string, unknown>>
  getStudentAssignment(id: string): Promise<Record<string, unknown>>
  listAssignmentLessonOptions(id: string): Promise<unknown[]>
  listAssignmentRoster(id: string): Promise<unknown[]>
  getSubmissionDetail(id: string): Promise<Record<string, unknown>>
  listSubmissionFiles(id: string): Promise<unknown[]>
  createAssignment(input: {
    classId: string; lessonId: string | null; title: string; description: string
    dueAt: string | null; allowLate: boolean
  }): Promise<string>
  updateAssignment(id: string, input: {
    title: string; description: string; dueAt: string | null; allowLate: boolean
  }): Promise<void>
  setAssignmentStatus(id: string, status: string): Promise<void>
  submitMyAssignment(id: string): Promise<{ id: string; status: string }>
  reviewSubmission(id: string, action: 'reviewed' | 'revision_requested', feedback: string): Promise<void>
}

const gatewayCalls: RpcCall[] = []
const gatewayResponses = new Map<string, unknown>()
let gatewayFailure: Error | null = null

async function loadAssignmentService() {
  const source = await readFile(new URL('../src/services/assignmentService.ts', import.meta.url), 'utf8')
  const executable = source
    .replace("import { callGatewayRpc } from '@/lib/rpc'", `const { callGatewayRpc } = globalThis.__assignmentServiceDeps`)
    .replace(/import type \{[\s\S]*?\} from '@\/types'\r?\n/, '')
  Object.assign(globalThis, {
    __assignmentServiceDeps: {
      callGatewayRpc: async (operation: string, params?: Record<string, unknown>) => {
        gatewayCalls.push({ operation, params })
        if (gatewayFailure) throw gatewayFailure
        return gatewayResponses.get(operation)
      },
    },
  })
  const directory = await mkdtemp(join(tmpdir(), 'dataclass-assignment-service-'))
  const modulePath = join(directory, 'assignmentService.ts')
  await writeFile(modulePath, executable)
  try {
    return await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`) as AssignmentServiceModule
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const service = await loadAssignmentService()

function reset() {
  gatewayCalls.length = 0
  gatewayResponses.clear()
  gatewayFailure = null
}

const assignmentRow = {
  assignment_id: 'assignment-a', class_id: 'class-a', class_name: 'Synthetic class',
  lesson_id: 'lesson-a', lesson_title: 'Lesson', title: 'Assignment', description: null,
  status: 'published', due_at: null, allow_late_submission: true,
  published_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z', total_students: '2', submitted_count: '1',
  late_count: '0', revision_requested_count: '0', reviewed_count: '1', submission_id: 'submission-a',
  submission_status: 'submitted', submitted_at: '2026-01-03T00:00:00.000Z', reviewed_at: null,
  feedback_message: null,
}

test('all eight assignmentService reads use exact gateway keys and parameters', async () => {
  reset()
  gatewayResponses.set('list_teacher_assignments', [assignmentRow])
  gatewayResponses.set('list_student_assignments', null)
  gatewayResponses.set('get_teacher_assignment', [assignmentRow])
  gatewayResponses.set('get_student_assignment', [assignmentRow])
  gatewayResponses.set('list_assignment_lesson_options', [{
    lesson_id: 'lesson-a', lesson_title: 'Lesson', module_title: 'Module',
  }])
  gatewayResponses.set('list_assignment_roster', [{
    student_id: 'student-a', full_name: 'Student', email: 'student.invalid', submission_id: 'submission-a',
    submission_status: 'submitted', submitted_at: '2026-01-03T00:00:00.000Z', reviewed_at: null, was_late: false,
  }])
  gatewayResponses.set('get_submission_detail', [{
    submission_id: 'submission-a', assignment_id: 'assignment-a', assignment_title: 'Assignment',
    student_id: 'student-a', student_name: 'Student', student_email: 'student.invalid',
    student_avatar_url: null, submission_status: 'submitted', submitted_at: '2026-01-03T00:00:00.000Z',
    reviewed_at: null, feedback_message: null, can_review: true, was_late: false,
  }])
  gatewayResponses.set('list_submission_files', [{
    id: 'file-a', file_name: 'work.pdf', resource_kind: 'pdf', file_size_bytes: '42',
    mime_type: 'application/pdf', file_version: 1, uploaded_at: '2026-01-03T00:00:00.000Z',
  }])

  assert.equal((await service.listTeacherAssignments())[0]?.totalStudents, 2)
  assert.deepEqual(await service.listStudentAssignments(), [])
  assert.equal((await service.getTeacherAssignment('assignment-a')).id, 'assignment-a')
  assert.equal((await service.getStudentAssignment('assignment-a')).submissionStatus, 'submitted')
  assert.equal((await service.listAssignmentLessonOptions('class-a'))[0]?.moduleTitle, 'Module')
  assert.equal((await service.listAssignmentRoster('assignment-a'))[0]?.wasLate, false)
  assert.equal((await service.getSubmissionDetail('submission-a')).canReview, true)
  assert.equal((await service.listSubmissionFiles('submission-a'))[0]?.fileSizeBytes, 42)

  assert.deepEqual(gatewayCalls, [
    { operation: 'list_teacher_assignments', params: undefined },
    { operation: 'list_student_assignments', params: undefined },
    { operation: 'get_teacher_assignment', params: { target_assignment_id: 'assignment-a' } },
    { operation: 'get_student_assignment', params: { target_assignment_id: 'assignment-a' } },
    { operation: 'list_assignment_lesson_options', params: { target_class_id: 'class-a' } },
    { operation: 'list_assignment_roster', params: { target_assignment_id: 'assignment-a' } },
    { operation: 'get_submission_detail', params: { target_submission_id: 'submission-a' } },
    { operation: 'list_submission_files', params: { target_submission_id: 'submission-a' } },
  ])
  assert.equal(gatewayCalls.some(({ params }) => Object.keys(params ?? {}).some((key) => /(?:user|actor)_id/.test(key))), false)
})

test('gateway failures preserve missing-row behavior and never fall back', async () => {
  reset()
  gatewayResponses.set('get_teacher_assignment', [])
  await assert.rejects(service.getTeacherAssignment('missing'), /Assignment not found/)
  const expected = new Error('normalized gateway failure')
  gatewayFailure = expected
  await assert.rejects(service.getSubmissionDetail('submission-a'), (error) => error === expected)
  assert.equal(gatewayCalls.length, 2)
})

test('all five assignment and submission mutations use exact gateway keys, parameters, and contracts', async () => {
  reset()
  gatewayResponses.set('create_assignment', 'created-assignment')
  gatewayResponses.set('update_assignment', null)
  gatewayResponses.set('set_assignment_status', null)
  gatewayResponses.set('submit_my_assignment', [{ submission_id: 'submission-a', submission_status: 'submitted' }])
  gatewayResponses.set('review_submission', null)

  assert.equal(await service.createAssignment({
    classId: 'class-a', lessonId: 'lesson-a', title: 'Assignment', description: '', dueAt: null, allowLate: true,
  }), 'created-assignment')
  await service.updateAssignment('assignment-a', {
    title: 'Assignment', description: '', dueAt: null, allowLate: true,
  })
  await service.setAssignmentStatus('assignment-a', 'published')
  assert.deepEqual(await service.submitMyAssignment('assignment-a'), { id: 'submission-a', status: 'submitted' })
  await service.reviewSubmission('submission-a', 'reviewed', '')

  assert.deepEqual(gatewayCalls, [
    { operation: 'create_assignment', params: {
      target_class_id: 'class-a', target_lesson_id: 'lesson-a', assignment_title: 'Assignment',
      assignment_description: null, assignment_due_at: null, assignment_allow_late: true,
    } },
    { operation: 'update_assignment', params: {
      target_assignment_id: 'assignment-a', assignment_title: 'Assignment',
      assignment_description: null, assignment_due_at: null, assignment_allow_late: true,
    } },
    { operation: 'set_assignment_status', params: { target_assignment_id: 'assignment-a', next_status: 'published' } },
    { operation: 'submit_my_assignment', params: { target_assignment_id: 'assignment-a' } },
    { operation: 'review_submission', params: {
      target_submission_id: 'submission-a', review_action: 'reviewed', feedback_message: null,
    } },
  ])
})

test('both AuthContext M2 operations use the gateway once without legacy replay', async () => {
  const source = await readFile(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8')
  const operations = [...source.matchAll(/callGatewayRpc(?:<[^>]+>)?\(\s*["']([a-z0-9_]+)["']/g)].map((match) => match[1])
  assert.deepEqual(operations, ['bootstrap_current_user', 'claim_my_class_invitations'])
  for (const operation of operations) {
    const definition = GATEWAY_OPERATION_ROWS.find(({ key }) => key === operation)
    assert.equal(definition?.access, 'MUTATION')
    assert.equal(definition?.mutationClass, 'M2')
  }
  assert.doesNotMatch(source, /neonClient\.rpc|resolveBootstrapWithIdentityRetry|isBootstrapIdentityUnavailableError|createBootstrapRetryIssue/)
  assert.equal(source.match(/"bootstrap_current_user"/g)?.length, 1)
  assert.match(source, /runSingleFlight\(initializationRef, performAuthResolution\)/)
  assert.match(source, /neonClient\.auth\.getSession\(\)/)
  assert.match(source, /neonClient\.auth\.signIn\.social/)
  assert.match(source, /neonClient\.auth\.signOut/)
})

test('both M3 assignment mutations execute once for success and ambiguous failures', async () => {
  const cases: Array<[string, () => Promise<unknown>, unknown]> = [
    ['create_assignment', () => service.createAssignment({
      classId: 'class-a', lessonId: null, title: 'Assignment', description: '', dueAt: null, allowLate: true,
    }), 'created-assignment'],
    ['review_submission', () => service.reviewSubmission('submission-a', 'reviewed', ''), null],
  ]
  for (const [operation, invoke, response] of cases) {
    reset()
    gatewayResponses.set(operation, response)
    await invoke()
    assert.equal(gatewayCalls.length, 1)
    for (const failure of [
      new Error('timeout'), new TypeError('network unavailable'),
      Object.assign(new Error('database unavailable'), { code: 'DATABASE_UNAVAILABLE' }),
      new Error('commit outcome unknown'),
    ]) {
      reset()
      gatewayFailure = failure
      await assert.rejects(invoke(), (error) => error === failure)
      assert.equal(gatewayCalls.length, 1, `${operation} failure`)
      assert.equal(gatewayCalls[0]?.operation, operation)
    }
  }
})

test('assignmentService has no Data API transport, retry loop, or fallback path', async () => {
  const source = await readFile(new URL('../src/services/assignmentService.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /neonClient|\.rpc\(|retry|fallback/i)
  assert.equal(source.match(/callGatewayRpc<T>/g)?.length, 1)
})

test('storageService remains unchanged and outside the assignment gateway path', async () => {
  const assignmentSource = await readFile(new URL('../src/services/assignmentService.ts', import.meta.url), 'utf8')
  const storageSource = await readFile(new URL('../src/services/storageService.ts', import.meta.url), 'utf8')
  assert.equal(assignmentSource.match(/callGatewayRpc</g)?.length, 1)
  assert.doesNotMatch(storageSource, /callGatewayRpc/)
})
