import { neonClient } from '@/lib/neon'
import type {
  ClassInstructor,
  ClassInvitation,
  ClassOverview,
  ClassStudent,
  ManagedClass,
} from '@/types'

type RpcRow = Record<string, unknown>

function rows<T extends RpcRow>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : []
}

async function rpc<T extends RpcRow>(name: string, args?: Record<string, unknown>) {
  const result = await neonClient.rpc(name, args)
  if (result.error) throw result.error
  return rows<T>(result.data)
}

const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullableText = (value: unknown) => typeof value === 'string' ? value : null
const count = (value: unknown) => Number(value ?? 0)

function mapClass(row: RpcRow): ManagedClass {
  return {
    id: text(row.id),
    name: text(row.name),
    description: nullableText(row.description),
    status: text(row.status),
    teacherRole: row.teacher_role === 'owner' || row.teacher_role === 'instructor' ? row.teacher_role : undefined,
    ownerName: nullableText(row.owner_name) ?? undefined,
    studentCount: count(row.student_count),
    instructorCount: row.instructor_count == null ? undefined : count(row.instructor_count),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }
}

export async function listTeacherClasses() {
  return (await rpc('list_my_teacher_classes')).map(mapClass)
}

export async function listStudentClasses() {
  return (await rpc('list_my_student_classes')).map(mapClass)
}

export async function createClass(name: string, description: string) {
  const result = await rpc<{ class_id: string }>('create_class', {
    class_name: name,
    class_description: description || null,
  })
  if (!result[0]?.class_id) throw new Error('The class was created without an identifier.')
  return result[0].class_id
}

export async function updateClass(classId: string, name: string, description: string, status: string) {
  await rpc('update_owned_class', {
    target_class_id: classId,
    class_name: name,
    class_description: description || null,
    class_status: status,
  })
}

export async function getClassOverview(classId: string): Promise<ClassOverview> {
  const result = await rpc('get_class_overview', { target_class_id: classId })
  const row = result[0]
  if (!row) throw new Error('Class not found.')
  return {
    ...mapClass(row),
    ownerId: text(row.owner_id),
    ownerName: text(row.owner_name),
    ownerEmail: text(row.owner_email),
    currentAccess: text(row.current_access) as ClassOverview['currentAccess'],
    instructorCount: count(row.instructor_count),
  }
}

export async function getMyStudentClassOverview(classId: string): Promise<ClassOverview> {
  const result = await rpc('get_my_student_class_overview', { target_class_id: classId })
  const row = result[0]
  if (!row) throw new Error('Class not found.')
  return {
    ...mapClass(row), ownerId: text(row.owner_id), ownerName: text(row.owner_name),
    ownerEmail: '', currentAccess: 'student', instructorCount: count(row.instructor_count),
  }
}

export async function getClassStudents(classId: string): Promise<ClassStudent[]> {
  return (await rpc('get_class_students', { target_class_id: classId })).map((row) => ({
    membershipId: text(row.membership_id), studentId: text(row.student_id),
    fullName: text(row.full_name), email: text(row.email), status: text(row.membership_status),
    joinedAt: text(row.joined_at),
  }))
}

export async function getClassInvitations(classId: string): Promise<ClassInvitation[]> {
  return (await rpc('get_class_invitations', { target_class_id: classId })).map((row) => ({
    id: text(row.id), email: text(row.email), status: text(row.status), createdAt: text(row.created_at),
    acceptedAt: nullableText(row.accepted_at), expiresAt: nullableText(row.expires_at),
  }))
}

export async function getClassInstructors(classId: string): Promise<ClassInstructor[]> {
  return (await rpc('get_class_instructors', { target_class_id: classId })).map((row) => ({
    relationshipId: text(row.relationship_id), teacherId: text(row.teacher_id),
    fullName: text(row.full_name), email: text(row.email), avatarUrl: nullableText(row.avatar_url),
    role: text(row.teacher_role) as ClassInstructor['role'], createdAt: text(row.created_at),
  }))
}

export async function getMyStudentClassInstructors(classId: string): Promise<ClassInstructor[]> {
  return (await rpc('get_my_student_class_instructors', { target_class_id: classId })).map((row) => ({
    relationshipId: text(row.relationship_id), teacherId: text(row.teacher_id),
    fullName: text(row.full_name), email: '', avatarUrl: nullableText(row.avatar_url),
    role: text(row.teacher_role) as ClassInstructor['role'], createdAt: text(row.created_at),
  }))
}

export async function inviteStudents(classId: string, emails: string[]) {
  return rpc<{ email: string; outcome: string }>('create_class_invitations', {
    target_class_id: classId,
    invitation_emails: emails,
  })
}

export async function revokeInvitation(invitationId: string) {
  await rpc('revoke_class_invitation', { target_invitation_id: invitationId })
}

export async function addInstructor(classId: string, email: string) {
  const result = await rpc<{ outcome: string }>('add_class_instructor_by_email', {
    target_class_id: classId,
    teacher_email: email,
  })
  return result[0]?.outcome ?? 'not_found'
}

export async function removeInstructor(classId: string, teacherId: string) {
  await rpc('remove_class_instructor', {
    target_class_id: classId,
    target_teacher_id: teacherId,
  })
}
