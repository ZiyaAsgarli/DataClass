import type { LucideIcon } from 'lucide-react'

export type UserRole = 'teacher' | 'student'

export interface AuthProfile {
  id: string
  fullName: string
  email: string
  avatarUrl: string | null
}

export interface NavItem { label: string; href: string; icon: LucideIcon }

export type ClassStatus = 'active' | 'archived'
export type ClassAccess = 'owner' | 'instructor' | 'student'

export interface ManagedClass {
  id: string
  name: string
  description: string | null
  status: string
  teacherRole?: 'owner' | 'instructor'
  ownerName?: string
  studentCount: number
  instructorCount?: number
  createdAt: string
  updatedAt: string
}

export interface ClassOverview extends ManagedClass {
  ownerId: string
  ownerName: string
  ownerEmail: string
  currentAccess: ClassAccess
  instructorCount: number
}

export interface ClassStudent {
  membershipId: string
  studentId: string
  fullName: string
  email: string
  status: string
  joinedAt: string
}

export interface ClassInvitation {
  id: string
  email: string
  status: string
  createdAt: string
  acceptedAt: string | null
  expiresAt: string | null
}

export interface ClassInstructor {
  relationshipId: string
  teacherId: string
  fullName: string
  email: string
  avatarUrl: string | null
  role: 'owner' | 'instructor'
  createdAt: string
}

export type ModuleStatus = 'active' | 'completed' | 'archived'
export type ModuleLifecycleStatus = 'upcoming' | 'active' | 'completed'
export type LessonLifecycleStatus = 'draft' | 'published' | 'archived'
export type ModuleAccess = 'owner' | 'module_instructor' | 'viewer'

export interface CourseModuleRecord {
  id: string
  classId: string
  className?: string
  title: string
  description: string | null
  position: number
  status: ModuleStatus
  lifecycleStatus: ModuleLifecycleStatus
  lessonCount?: number
  publishedLessonCount: number
  instructorNames: string[]
  canManage?: boolean
  currentAccess?: ModuleAccess
  createdAt: string
  updatedAt: string
}

export interface CourseLessonRecord {
  id: string
  moduleId: string
  classId?: string
  className?: string
  moduleTitle?: string
  title: string
  description: string | null
  lessonDate: string | null
  position: number
  status: LessonLifecycleStatus
  publishedAt: string | null
  currentAccess?: ModuleAccess
  createdAt: string
  updatedAt: string
}

export interface LessonVideoRecord {
  provider: 'youtube' | null
  videoId: string | null
  videoUrl?: string | null
  durationSeconds: number | null
  canManage?: boolean
}

export interface LessonResourceRecord {
  id: string
  title: string
  resourceKind: string
  fileName: string
  fileSizeBytes: number
  mimeType: string
  position: number
  uploadedAt: string
  canManage?: boolean
}

export interface ModuleInstructorOption {
  teacherId: string
  fullName: string
  classRole: 'owner' | 'instructor'
  assigned: boolean
}

export type AssignmentStatus = 'draft' | 'published' | 'closed' | 'archived'
export type SubmissionStatus = 'draft' | 'submitted' | 'late' | 'reviewed' | 'revision_requested' | 'resubmitted'

export interface AssignmentRecord {
  id: string
  classId: string
  className: string
  lessonId: string | null
  lessonTitle: string | null
  title: string
  description: string | null
  status: AssignmentStatus
  dueAt: string | null
  allowLateSubmission: boolean
  publishedAt: string | null
  createdAt?: string
  updatedAt?: string
  totalStudents?: number
  submittedCount?: number
  lateCount?: number
  revisionRequestedCount?: number
  reviewedCount?: number
  submissionId?: string | null
  submissionStatus?: SubmissionStatus | null
  submittedAt?: string | null
  reviewedAt?: string | null
  feedbackMessage?: string | null
}

export interface AssignmentLessonOption {
  id: string
  title: string
  moduleTitle: string
}

export interface AssignmentRosterEntry {
  studentId: string
  fullName: string
  email: string
  submissionId: string | null
  status: SubmissionStatus | null
  submittedAt: string | null
  reviewedAt: string | null
  wasLate: boolean
}

export interface SubmissionDetail {
  id: string
  assignmentId: string
  assignmentTitle: string
  studentId: string
  studentName: string
  studentEmail: string
  status: SubmissionStatus
  submittedAt: string | null
  reviewedAt: string | null
  feedbackMessage: string | null
  canReview: boolean
  wasLate: boolean
}

export interface SubmissionFileRecord extends LessonResourceRecord {
  version: number
}
