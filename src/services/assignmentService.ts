import { neonClient } from '@/lib/neon'
import type {
  AssignmentLessonOption,
  AssignmentRecord,
  AssignmentRosterEntry,
  AssignmentStatus,
  SubmissionDetail,
  SubmissionFileRecord,
  SubmissionStatus,
} from '@/types'

type RpcRow = Record<string, unknown>

const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullableText = (value: unknown) => typeof value === 'string' ? value : null
const count = (value: unknown) => Number(value ?? 0)

async function rpc<T = RpcRow[]>(name: string, args?: Record<string, unknown>) {
  const result = await neonClient.rpc(name, args)
  if (result.error) throw result.error
  return result.data as T
}

function rows(value: unknown) { return Array.isArray(value) ? value as RpcRow[] : [] }

function mapAssignment(row: RpcRow): AssignmentRecord {
  return {
    id: text(row.assignment_id),
    classId: text(row.class_id),
    className: text(row.class_name),
    lessonId: nullableText(row.lesson_id),
    lessonTitle: nullableText(row.lesson_title),
    title: text(row.title),
    description: nullableText(row.description),
    status: text(row.status) as AssignmentStatus,
    dueAt: nullableText(row.due_at),
    allowLateSubmission: row.allow_late_submission !== false,
    publishedAt: nullableText(row.published_at),
    createdAt: nullableText(row.created_at) ?? undefined,
    updatedAt: nullableText(row.updated_at) ?? undefined,
    totalStudents: row.total_students == null ? undefined : count(row.total_students),
    submittedCount: row.submitted_count == null ? undefined : count(row.submitted_count),
    lateCount: row.late_count == null ? undefined : count(row.late_count),
    revisionRequestedCount: row.revision_requested_count == null ? undefined : count(row.revision_requested_count),
    reviewedCount: row.reviewed_count == null ? undefined : count(row.reviewed_count),
    submissionId: nullableText(row.submission_id),
    submissionStatus: nullableText(row.submission_status) as SubmissionStatus | null,
    submittedAt: nullableText(row.submitted_at),
    reviewedAt: nullableText(row.reviewed_at),
    feedbackMessage: nullableText(row.feedback_message),
  }
}

export async function listTeacherAssignments() {
  return rows(await rpc('list_teacher_assignments')).map(mapAssignment)
}

export async function listStudentAssignments() {
  return rows(await rpc('list_student_assignments')).map(mapAssignment)
}

export async function getTeacherAssignment(id: string) {
  const row = rows(await rpc('get_teacher_assignment', { target_assignment_id: id }))[0]
  if (!row) throw new Error('Assignment not found.')
  return mapAssignment(row)
}

export async function getStudentAssignment(id: string) {
  const row = rows(await rpc('get_student_assignment', { target_assignment_id: id }))[0]
  if (!row) throw new Error('Assignment not found.')
  return mapAssignment(row)
}

export async function createAssignment(input: {
  classId: string
  lessonId: string | null
  title: string
  description: string
  dueAt: string | null
  allowLate: boolean
}) {
  const data = await rpc<unknown>('create_assignment', {
    target_class_id: input.classId,
    target_lesson_id: input.lessonId,
    assignment_title: input.title,
    assignment_description: input.description || null,
    assignment_due_at: input.dueAt,
    assignment_allow_late: input.allowLate,
  })
  const id = typeof data === 'string' ? data : text(rows(data)[0]?.create_assignment)
  if (!id) throw new Error('The assignment was created without an identifier.')
  return id
}

export async function updateAssignment(id: string, input: Omit<Parameters<typeof createAssignment>[0], 'classId' | 'lessonId'>) {
  await rpc('update_assignment', {
    target_assignment_id: id,
    assignment_title: input.title,
    assignment_description: input.description || null,
    assignment_due_at: input.dueAt,
    assignment_allow_late: input.allowLate,
  })
}

export async function setAssignmentStatus(id: string, status: AssignmentStatus) {
  await rpc('set_assignment_status', { target_assignment_id: id, next_status: status })
}

export async function listAssignmentLessonOptions(classId: string): Promise<AssignmentLessonOption[]> {
  return rows(await rpc('list_assignment_lesson_options', { target_class_id: classId })).map((row) => ({
    id: text(row.lesson_id), title: text(row.lesson_title), moduleTitle: text(row.module_title),
  }))
}

export async function listAssignmentRoster(id: string): Promise<AssignmentRosterEntry[]> {
  return rows(await rpc('list_assignment_roster', { target_assignment_id: id })).map((row) => ({
    studentId: text(row.student_id), fullName: text(row.full_name), email: text(row.email),
    submissionId: nullableText(row.submission_id),
    status: nullableText(row.submission_status) as SubmissionStatus | null,
    submittedAt: nullableText(row.submitted_at), reviewedAt: nullableText(row.reviewed_at),
    wasLate: row.was_late === true,
  }))
}

export async function submitMyAssignment(id: string) {
  const row = rows(await rpc('submit_my_assignment', { target_assignment_id: id }))[0]
  if (!row) throw new Error('The submission could not be completed.')
  return { id: text(row.submission_id), status: text(row.submission_status) as SubmissionStatus }
}

export async function getSubmissionDetail(id: string): Promise<SubmissionDetail> {
  const row = rows(await rpc('get_submission_detail', { target_submission_id: id }))[0]
  if (!row) throw new Error('Submission not found.')
  return {
    id: text(row.submission_id), assignmentId: text(row.assignment_id),
    assignmentTitle: text(row.assignment_title), studentId: text(row.student_id),
    studentName: text(row.student_name), studentEmail: text(row.student_email),
    status: text(row.submission_status) as SubmissionStatus,
    submittedAt: nullableText(row.submitted_at), reviewedAt: nullableText(row.reviewed_at),
    feedbackMessage: nullableText(row.feedback_message), canReview: row.can_review === true,
    wasLate: row.was_late === true,
  }
}

export async function listSubmissionFiles(id: string): Promise<SubmissionFileRecord[]> {
  return rows(await rpc('list_submission_files', { target_submission_id: id })).map((row) => ({
    id: text(row.id), title: text(row.file_name), fileName: text(row.file_name),
    resourceKind: text(row.resource_kind), fileSizeBytes: count(row.file_size_bytes),
    mimeType: text(row.mime_type), position: 0, uploadedAt: text(row.uploaded_at),
    version: count(row.file_version),
  }))
}

export async function reviewSubmission(id: string, action: 'reviewed' | 'revision_requested', feedback: string) {
  await rpc('review_submission', {
    target_submission_id: id,
    review_action: action,
    feedback_message: feedback || null,
  })
}
