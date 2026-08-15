import { BookOpen, CheckCircle2, Clock3, FileCheck2, LayoutDashboard, LineChart, Users, UsersRound } from 'lucide-react'
import type { ActivityItem, CourseClass, Deadline, ModuleLessons, NavItem, StatCard } from '@/types'

export const teacherNav: NavItem[] = [
  { label: 'Overview', href: '/teacher', icon: LayoutDashboard },
  { label: 'Classes', href: '/teacher/classes', icon: BookOpen },
  { label: 'Assignments', icon: FileCheck2 },
  { label: 'Students', icon: UsersRound },
  { label: 'Reviews', icon: CheckCircle2 },
]

export const studentNav: NavItem[] = [
  { label: 'Overview', href: '/student', icon: LayoutDashboard },
  { label: 'My Classes', href: '/student/classes/demo-class', icon: BookOpen },
  { label: 'Assignments', icon: FileCheck2 },
  { label: 'Progress', icon: LineChart },
]

export const teacherStats: StatCard[] = [
  { label: 'Active Classes', value: '2', change: 'Both on track', tone: 'green', icon: BookOpen },
  { label: 'Students', value: '24', change: '+3 this month', tone: 'blue', icon: Users },
  { label: 'Pending Reviews', value: '7', change: 'Needs attention', tone: 'amber', icon: Clock3 },
  { label: 'Submission Rate', value: '87%', change: '+5% from last week', tone: 'violet', icon: LineChart },
]

export const classes: CourseClass[] = [
  {
    id: 'demo-class', title: 'Data Analytics — Batch 01', students: 24, updated: 'Updated 2 hours ago', overallProgress: 42,
    modules: [
      { name: 'Excel', progress: 72 }, { name: 'SQL', progress: 15 }, { name: 'Power BI', progress: 0 }, { name: 'Python', progress: 0, locked: true },
    ],
  },
  {
    id: 'batch-02', title: 'Data Analytics — Batch 02', students: 18, updated: 'Updated yesterday', overallProgress: 18,
    modules: [
      { name: 'Excel', progress: 38 }, { name: 'SQL', progress: 0 }, { name: 'Power BI', progress: 0 }, { name: 'Python', progress: 0, locked: true },
    ],
  },
]

export const teacherActivity: ActivityItem[] = [
  { id: 'a1', title: '6 students submitted Excel Task #04', time: '18 minutes ago', kind: 'submission' },
  { id: 'a2', title: 'SQL Lesson 02 was published', time: '2 hours ago', kind: 'lesson' },
  { id: 'a3', title: '3 assignments are waiting for review', time: 'Yesterday', kind: 'review' },
]

export const studentActivity: ActivityItem[] = [
  { id: 's1', title: 'Teacher published SQL Lesson 02', time: '2 hours ago', kind: 'lesson' },
  { id: 's2', title: 'Excel Task #03 was marked complete', time: 'Yesterday', kind: 'submission' },
  { id: 's3', title: 'Your course progress reached 24%', time: 'Aug 12', kind: 'review' },
]

export const deadlines: Deadline[] = [
  { id: 'd1', title: 'Excel Task #04', module: 'Excel', date: 'Aug 16', submissions: '18 of 24 submitted' },
  { id: 'd2', title: 'Excel Task #05', module: 'Excel', date: 'Aug 20', submissions: '4 of 24 submitted' },
  { id: 'd3', title: 'SQL Practice Set #01', module: 'SQL', date: 'Aug 24', submissions: 'Not open yet' },
]

export const studentAssignments: Deadline[] = [
  { id: 'sa1', title: 'Excel Task #04', module: 'Excel', date: 'Aug 16', submissions: 'Not submitted', status: 'Due soon' },
  { id: 'sa2', title: 'Excel Task #05', module: 'Excel', date: 'Aug 20', submissions: 'Upcoming', status: 'Upcoming' },
]

export const classModules: ModuleLessons[] = [
  {
    name: 'Excel', description: 'Build a strong foundation in spreadsheets and analysis.', progress: 68,
    lessons: [
      { id: 'l1', number: 'Lesson 01', title: 'Excel Basics', status: 'completed' },
      { id: 'l2', number: 'Lesson 02', title: 'Formulas', status: 'completed' },
      { id: 'l3', number: 'Lesson 03', title: 'Lookup Functions', status: 'current' },
      { id: 'l4', number: 'Lesson 04', title: 'Pivot Tables', status: 'locked' },
    ],
  },
  { name: 'SQL', description: 'Query and transform structured data.', progress: 0, lessons: [], upcoming: true },
  { name: 'Power BI', description: 'Turn data into clear business intelligence.', progress: 0, lessons: [], upcoming: true },
  { name: 'Python', description: 'Automate analysis with Python.', progress: 0, lessons: [], upcoming: true },
]
