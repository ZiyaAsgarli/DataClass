import { neonClient } from '@/lib/neon'
import type {
  CourseLessonRecord,
  CourseModuleRecord,
  LessonLifecycleStatus,
  LessonVideoRecord,
  ModuleInstructorOption,
  ModuleStatus,
} from '@/types'

type RpcRow = Record<string, unknown>

async function rpc<T extends RpcRow>(name: string, args?: Record<string, unknown>) {
  const result = await neonClient.rpc(name, args)
  if (result.error) throw result.error
  return (Array.isArray(result.data) ? result.data : []) as T[]
}

const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullableText = (value: unknown) => typeof value === 'string' ? value : null
const count = (value: unknown) => Number(value ?? 0)
const textArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function mapModule(row: RpcRow): CourseModuleRecord {
  return {
    id: text(row.id), classId: text(row.class_id), className: nullableText(row.class_name) ?? undefined,
    title: text(row.title), description: nullableText(row.description), position: count(row.module_position),
    status: text(row.status) as ModuleStatus, lessonCount: row.lesson_count == null ? undefined : count(row.lesson_count),
    publishedLessonCount: count(row.published_lesson_count), instructorNames: textArray(row.instructor_names),
    canManage: typeof row.can_manage === 'boolean' ? row.can_manage : undefined,
    currentAccess: row.current_access as CourseModuleRecord['currentAccess'],
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  }
}

function mapLesson(row: RpcRow): CourseLessonRecord {
  return {
    id: text(row.id), moduleId: text(row.module_id), classId: nullableText(row.class_id) ?? undefined,
    className: nullableText(row.class_name) ?? undefined, moduleTitle: nullableText(row.module_title) ?? undefined,
    title: text(row.title), description: nullableText(row.description), lessonDate: nullableText(row.lesson_date),
    position: count(row.lesson_position), status: text(row.status) as LessonLifecycleStatus,
    publishedAt: nullableText(row.published_at), currentAccess: row.current_access as CourseLessonRecord['currentAccess'],
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  }
}

function mapLessonVideo(row: RpcRow, includeUrl = false): LessonVideoRecord {
  return {
    provider: row.video_provider === 'youtube' ? 'youtube' : null,
    videoId: nullableText(row.video_id),
    videoUrl: includeUrl ? nullableText(row.video_url) : undefined,
    durationSeconds: row.video_duration_seconds == null ? null : count(row.video_duration_seconds),
    canManage: typeof row.can_manage === 'boolean' ? row.can_manage : undefined,
  }
}

export async function listTeacherClassModules(classId: string) {
  return (await rpc('list_teacher_class_modules', { target_class_id: classId })).map(mapModule)
}

export async function getTeacherModule(moduleId: string) {
  const row = (await rpc('get_teacher_module', { target_module_id: moduleId }))[0]
  if (!row) throw new Error('Module not found.')
  return mapModule(row)
}

export async function createModule(classId: string, title: string, description: string) {
  const row = (await rpc<{ module_id: string }>('create_module', {
    target_class_id: classId, module_title: title, module_description: description || null,
  }))[0]
  if (!row?.module_id) throw new Error('Module identifier was not returned.')
  return row.module_id
}

export async function updateModule(moduleId: string, title: string, description: string, status: ModuleStatus) {
  await rpc('update_module', {
    target_module_id: moduleId, module_title: title,
    module_description: description || null, module_status: status,
  })
}

export async function reorderModule(moduleId: string, direction: 'up' | 'down') {
  await rpc('reorder_module', { target_module_id: moduleId, move_direction: direction })
}

export async function listModuleInstructorOptions(moduleId: string): Promise<ModuleInstructorOption[]> {
  return (await rpc('list_module_instructor_options', { target_module_id: moduleId })).map((row) => ({
    teacherId: text(row.teacher_id), fullName: text(row.full_name),
    classRole: text(row.class_role) as ModuleInstructorOption['classRole'], assigned: row.assigned === true,
  }))
}

export async function assignModuleInstructor(moduleId: string, teacherId: string) {
  return (await rpc<{ outcome: string }>('assign_module_instructor', {
    target_module_id: moduleId, target_teacher_id: teacherId,
  }))[0]?.outcome ?? 'exists'
}

export async function removeModuleInstructor(moduleId: string, teacherId: string) {
  await rpc('remove_module_instructor', { target_module_id: moduleId, target_teacher_id: teacherId })
}

export async function listTeacherModuleLessons(moduleId: string) {
  return (await rpc('list_teacher_module_lessons', { target_module_id: moduleId })).map(mapLesson)
}

export async function getTeacherLesson(lessonId: string) {
  const row = (await rpc('get_teacher_lesson', { target_lesson_id: lessonId }))[0]
  if (!row) throw new Error('Lesson not found.')
  return mapLesson(row)
}

export async function createLesson(moduleId: string, title: string, description: string, lessonDate: string) {
  const row = (await rpc<{ lesson_id: string }>('create_lesson', {
    target_module_id: moduleId, lesson_title: title, lesson_description: description || null,
    target_lesson_date: lessonDate || null,
  }))[0]
  if (!row?.lesson_id) throw new Error('Lesson identifier was not returned.')
  return row.lesson_id
}

export async function updateLesson(lessonId: string, title: string, description: string, lessonDate: string, status: LessonLifecycleStatus) {
  await rpc('update_lesson', {
    target_lesson_id: lessonId, lesson_title: title, lesson_description: description || null,
    target_lesson_date: lessonDate || null, lesson_status: status,
  })
}

export async function reorderLesson(lessonId: string, direction: 'up' | 'down') {
  await rpc('reorder_lesson', { target_lesson_id: lessonId, move_direction: direction })
}

export async function listStudentClassModules(classId: string) {
  return (await rpc('list_student_class_modules', { target_class_id: classId })).map(mapModule)
}

export async function getStudentModule(moduleId: string) {
  const row = (await rpc('get_student_module', { target_module_id: moduleId }))[0]
  if (!row) throw new Error('Module not found.')
  return mapModule(row)
}

export async function listStudentModuleLessons(moduleId: string) {
  return (await rpc('list_student_module_lessons', { target_module_id: moduleId })).map(mapLesson)
}

export async function getStudentLesson(lessonId: string) {
  const row = (await rpc('get_student_lesson', { target_lesson_id: lessonId }))[0]
  if (!row) throw new Error('Lesson not found.')
  return mapLesson(row)
}

export async function getTeacherLessonVideo(lessonId: string) {
  const row = (await rpc('get_teacher_lesson_video', { target_lesson_id: lessonId }))[0]
  if (!row) throw new Error('Lesson recording state was not returned.')
  return mapLessonVideo(row, true)
}

export async function getStudentLessonVideo(lessonId: string) {
  const row = (await rpc('get_student_lesson_video', { target_lesson_id: lessonId }))[0]
  if (!row) throw new Error('Lesson recording state was not returned.')
  return mapLessonVideo(row)
}

export async function setLessonYouTubeVideo(lessonId: string, youtubeUrl: string) {
  const row = (await rpc<{ video_id: string; canonical_url: string }>('set_lesson_youtube_video', {
    target_lesson_id: lessonId,
    youtube_url: youtubeUrl,
  }))[0]
  if (!row?.video_id || !row.canonical_url) throw new Error('Video metadata was not returned.')
  return { videoId: row.video_id, canonicalUrl: row.canonical_url }
}

export async function removeLessonVideo(lessonId: string) {
  await rpc('remove_lesson_video', { target_lesson_id: lessonId })
}
