import type { LucideIcon } from 'lucide-react'

export type UserRole = 'teacher' | 'student'
export type LessonStatus = 'completed' | 'current' | 'locked' | 'upcoming'

export interface AuthProfile {
  id: string
  fullName: string
  email: string
  avatarUrl: string | null
}

export interface NavItem { label: string; href?: string; icon: LucideIcon }
export interface StatCard { label: string; value: string; change: string; tone: 'green' | 'blue' | 'amber' | 'violet'; icon: LucideIcon }
export interface CourseModule { name: string; progress: number; locked?: boolean }
export interface CourseClass { id: string; title: string; students: number; modules: CourseModule[]; updated: string; overallProgress: number }
export interface ActivityItem { id: string; title: string; time: string; kind: 'submission' | 'lesson' | 'review' }
export interface Deadline { id: string; title: string; module: string; date: string; submissions: string; status?: string }
export interface Lesson { id: string; number: string; title: string; status: LessonStatus }
export interface ModuleLessons { name: string; description: string; progress: number; lessons: Lesson[]; upcoming?: boolean }

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
