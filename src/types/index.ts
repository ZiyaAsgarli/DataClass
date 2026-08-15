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
