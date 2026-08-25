import { BookOpen, FileCheck2, LayoutDashboard } from 'lucide-react'
import type { NavItem } from '@/types'

export const teacherNav: NavItem[] = [
  { label: 'Overview', href: '/teacher', icon: LayoutDashboard },
  { label: 'Classes', href: '/teacher/classes', icon: BookOpen },
  { label: 'Assignments', href: '/teacher/assignments', icon: FileCheck2 },
]

export const studentNav: NavItem[] = [
  { label: 'Overview', href: '/student', icon: LayoutDashboard },
  { label: 'My Classes', href: '/student/classes', icon: BookOpen },
  { label: 'Assignments', href: '/student/assignments', icon: FileCheck2 },
]
