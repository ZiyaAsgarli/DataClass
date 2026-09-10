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

interface ModuleServiceModule {
  listTeacherClassModules(id: string): Promise<unknown[]>
  getTeacherModule(id: string): Promise<Record<string, unknown>>
  listModuleInstructorOptions(id: string): Promise<unknown[]>
  listTeacherModuleLessons(id: string): Promise<unknown[]>
  getTeacherLesson(id: string): Promise<Record<string, unknown>>
  listStudentClassModules(id: string): Promise<unknown[]>
  getStudentModule(id: string): Promise<Record<string, unknown>>
  listStudentModuleLessons(id: string): Promise<unknown[]>
  getStudentLesson(id: string): Promise<Record<string, unknown>>
  getTeacherLessonVideo(id: string): Promise<Record<string, unknown>>
  getStudentLessonVideo(id: string): Promise<Record<string, unknown>>
  createModule(classId: string, title: string, description: string): Promise<string>
  updateModule(moduleId: string, title: string, description: string, status: string): Promise<void>
  setModuleLifecycle(moduleId: string, status: string): Promise<void>
  reorderModule(moduleId: string, direction: 'up' | 'down'): Promise<void>
  assignModuleInstructor(moduleId: string, teacherId: string): Promise<string>
  removeModuleInstructor(moduleId: string, teacherId: string): Promise<void>
  createLesson(moduleId: string, title: string, description: string, lessonDate: string): Promise<string>
  updateLesson(lessonId: string, title: string, description: string, lessonDate: string, status: string): Promise<void>
  reorderLesson(lessonId: string, direction: 'up' | 'down'): Promise<void>
  setLessonYouTubeVideo(lessonId: string, url: string): Promise<{ videoId: string; canonicalUrl: string }>
  removeLessonVideo(lessonId: string): Promise<void>
}

const gatewayCalls: RpcCall[] = []
const gatewayResponses = new Map<string, unknown>()
let gatewayFailure: Error | null = null

async function loadModuleService() {
  const source = await readFile(new URL('../src/services/moduleService.ts', import.meta.url), 'utf8')
  const executable = source
    .replace("import { callGatewayRpc } from '@/lib/rpc'", `const { callGatewayRpc } = globalThis.__moduleServiceDeps`)
    .replace(/import type \{[\s\S]*?\} from '@\/types'\r?\n/, '')
  Object.assign(globalThis, {
    __moduleServiceDeps: {
      callGatewayRpc: async (operation: string, params?: Record<string, unknown>) => {
        gatewayCalls.push({ operation, params })
        if (gatewayFailure) throw gatewayFailure
        return gatewayResponses.get(operation)
      },
    },
  })
  const directory = await mkdtemp(join(tmpdir(), 'dataclass-module-service-'))
  const modulePath = join(directory, 'moduleService.ts')
  await writeFile(modulePath, executable)
  try {
    return await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`) as ModuleServiceModule
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const service = await loadModuleService()

function reset() {
  gatewayCalls.length = 0
  gatewayResponses.clear()
  gatewayFailure = null
}

const moduleRow = {
  id: 'module-a', class_id: 'class-a', class_name: 'Synthetic class', title: 'Module', description: null,
  module_position: 2, status: 'active', lifecycle_status: 'active', lesson_count: '3',
  published_lesson_count: '2', instructor_names: ['Instructor'], can_manage: true,
  current_access: 'owner', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
}
const lessonRow = {
  id: 'lesson-a', module_id: 'module-a', class_id: 'class-a', class_name: 'Synthetic class',
  module_title: 'Module', title: 'Lesson', description: null, lesson_date: '2026-01-06',
  lesson_position: 1, status: 'published', published_at: '2026-01-03T00:00:00.000Z',
  current_access: 'owner', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
}

test('all eleven moduleService reads use exact gateway keys and parameters', async () => {
  reset()
  gatewayResponses.set('list_teacher_class_modules', [moduleRow])
  gatewayResponses.set('get_teacher_module', [moduleRow])
  gatewayResponses.set('list_module_instructor_options', [{
    teacher_id: 'teacher-a', full_name: 'Instructor', class_role: 'owner', assigned: true,
  }])
  gatewayResponses.set('list_teacher_module_lessons', [lessonRow])
  gatewayResponses.set('get_teacher_lesson', [lessonRow])
  gatewayResponses.set('list_student_class_modules', null)
  gatewayResponses.set('get_student_module', [moduleRow])
  gatewayResponses.set('list_student_module_lessons', [lessonRow])
  gatewayResponses.set('get_student_lesson', [lessonRow])
  gatewayResponses.set('get_teacher_lesson_video', [{
    video_provider: 'youtube', video_id: 'video-a', video_url: 'https://video.invalid/watch',
    video_duration_seconds: 90, can_manage: true,
  }])
  gatewayResponses.set('get_student_lesson_video', [{
    video_provider: 'youtube', video_id: 'video-a', video_duration_seconds: 90,
  }])

  assert.equal((await service.listTeacherClassModules('class-a'))[0]?.lessonCount, 3)
  assert.equal((await service.getTeacherModule('module-a')).position, 2)
  assert.equal((await service.listModuleInstructorOptions('module-a'))[0]?.assigned, true)
  assert.equal((await service.listTeacherModuleLessons('module-a'))[0]?.lessonDate, '2026-01-06')
  assert.equal((await service.getTeacherLesson('lesson-a')).title, 'Lesson')
  assert.deepEqual(await service.listStudentClassModules('class-a'), [])
  assert.equal((await service.getStudentModule('module-a')).id, 'module-a')
  assert.equal((await service.listStudentModuleLessons('module-a'))[0]?.position, 1)
  assert.equal((await service.getStudentLesson('lesson-a')).status, 'published')
  assert.equal((await service.getTeacherLessonVideo('lesson-a')).videoUrl, 'https://video.invalid/watch')
  assert.equal((await service.getStudentLessonVideo('lesson-a')).videoUrl, undefined)

  assert.deepEqual(gatewayCalls, [
    { operation: 'list_teacher_class_modules', params: { target_class_id: 'class-a' } },
    { operation: 'get_teacher_module', params: { target_module_id: 'module-a' } },
    { operation: 'list_module_instructor_options', params: { target_module_id: 'module-a' } },
    { operation: 'list_teacher_module_lessons', params: { target_module_id: 'module-a' } },
    { operation: 'get_teacher_lesson', params: { target_lesson_id: 'lesson-a' } },
    { operation: 'list_student_class_modules', params: { target_class_id: 'class-a' } },
    { operation: 'get_student_module', params: { target_module_id: 'module-a' } },
    { operation: 'list_student_module_lessons', params: { target_module_id: 'module-a' } },
    { operation: 'get_student_lesson', params: { target_lesson_id: 'lesson-a' } },
    { operation: 'get_teacher_lesson_video', params: { target_lesson_id: 'lesson-a' } },
    { operation: 'get_student_lesson_video', params: { target_lesson_id: 'lesson-a' } },
  ])
  assert.equal(gatewayCalls.some(({ params }) => Object.keys(params ?? {}).some((key) => /(?:user|actor)_id/.test(key))), false)
})

test('gateway failures preserve missing-row behavior and never fall back', async () => {
  reset()
  gatewayResponses.set('get_teacher_module', [])
  await assert.rejects(service.getTeacherModule('missing'), /Module not found/)
  const expected = new Error('normalized gateway failure')
  gatewayFailure = expected
  await assert.rejects(service.getStudentLesson('lesson-a'), (error) => error === expected)
  assert.equal(gatewayCalls.length, 2)
})

test('all eleven moduleService mutations use exact gateway keys, parameters, and response contracts', async () => {
  reset()
  gatewayResponses.set('create_module', [{ module_id: 'created-module' }])
  gatewayResponses.set('assign_module_instructor', [{ outcome: 'created' }])
  gatewayResponses.set('create_lesson', [{ lesson_id: 'created-lesson' }])
  gatewayResponses.set('set_lesson_youtube_video', [{ video_id: 'video-a', canonical_url: 'https://video.invalid/watch' }])
  for (const key of [
    'update_module', 'set_module_lifecycle', 'reorder_module', 'remove_module_instructor',
    'update_lesson', 'reorder_lesson', 'remove_lesson_video',
  ]) gatewayResponses.set(key, null)

  assert.equal(await service.createModule('class-a', 'Module', ''), 'created-module')
  await service.updateModule('module-a', 'Module', '', 'active')
  await service.setModuleLifecycle('module-a', 'active')
  await service.reorderModule('module-a', 'down')
  assert.equal(await service.assignModuleInstructor('module-a', 'teacher-a'), 'created')
  await service.removeModuleInstructor('module-a', 'teacher-a')
  assert.equal(await service.createLesson('module-a', 'Lesson', '', ''), 'created-lesson')
  await service.updateLesson('lesson-a', 'Lesson', '', '', 'published')
  await service.reorderLesson('lesson-a', 'up')
  assert.deepEqual(await service.setLessonYouTubeVideo('lesson-a', 'https://video.invalid/watch'), {
    videoId: 'video-a', canonicalUrl: 'https://video.invalid/watch',
  })
  await service.removeLessonVideo('lesson-a')

  assert.deepEqual(gatewayCalls, [
    { operation: 'create_module', params: { target_class_id: 'class-a', module_title: 'Module', module_description: null } },
    { operation: 'update_module', params: { target_module_id: 'module-a', module_title: 'Module', module_description: null, module_status: 'active' } },
    { operation: 'set_module_lifecycle', params: { target_module_id: 'module-a', requested_lifecycle_status: 'active' } },
    { operation: 'reorder_module', params: { target_module_id: 'module-a', move_direction: 'down' } },
    { operation: 'assign_module_instructor', params: { target_module_id: 'module-a', target_teacher_id: 'teacher-a' } },
    { operation: 'remove_module_instructor', params: { target_module_id: 'module-a', target_teacher_id: 'teacher-a' } },
    { operation: 'create_lesson', params: { target_module_id: 'module-a', lesson_title: 'Lesson', lesson_description: null, target_lesson_date: null } },
    { operation: 'update_lesson', params: { target_lesson_id: 'lesson-a', lesson_title: 'Lesson', lesson_description: null, target_lesson_date: null, lesson_status: 'published' } },
    { operation: 'reorder_lesson', params: { target_lesson_id: 'lesson-a', move_direction: 'up' } },
    { operation: 'set_lesson_youtube_video', params: { target_lesson_id: 'lesson-a', youtube_url: 'https://video.invalid/watch' } },
    { operation: 'remove_lesson_video', params: { target_lesson_id: 'lesson-a' } },
  ])
})

test('all four M3 module and lesson mutations execute once for success and ambiguous failures', async () => {
  const cases: Array<[string, () => Promise<unknown>, unknown]> = [
    ['create_module', () => service.createModule('class-a', 'Module', ''), [{ module_id: 'created-module' }]],
    ['reorder_module', () => service.reorderModule('module-a', 'up'), null],
    ['create_lesson', () => service.createLesson('module-a', 'Lesson', '', ''), [{ lesson_id: 'created-lesson' }]],
    ['reorder_lesson', () => service.reorderLesson('lesson-a', 'down'), null],
  ]
  for (const [operation, invoke, success] of cases) {
    reset()
    gatewayResponses.set(operation, success)
    await invoke()
    assert.equal(gatewayCalls.length, 1, `${operation} success`)
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

test('moduleService has no Data API transport, retry loop, or fallback path', async () => {
  const source = await readFile(new URL('../src/services/moduleService.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /neonClient|\.rpc\(|retry|fallback/i)
  assert.equal(source.match(/callGatewayRpc<unknown>/g)?.length, 1)
})

test('moduleService contains no storage operation or duplicate transport', async () => {
  const source = await readFile(new URL('../src/services/moduleService.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /storage|resource|upload|download|finalize/i)
  assert.equal(source.match(/callGatewayRpc</g)?.length, 1)
})
