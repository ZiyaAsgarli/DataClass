import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, RoleRedirect } from '@/components/auth/RouteAccess'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const StudentClassPage = lazy(() => import('@/pages/student/StudentClassPage').then((module) => ({ default: module.StudentClassPage })))
const StudentAssignmentDetailPage = lazy(() => import('@/pages/student/StudentAssignmentDetailPage').then((module) => ({ default: module.StudentAssignmentDetailPage })))
const StudentAssignmentsPage = lazy(() => import('@/pages/student/StudentAssignmentsPage').then((module) => ({ default: module.StudentAssignmentsPage })))
const StudentClassesPage = lazy(() => import('@/pages/student/StudentClassesPage').then((module) => ({ default: module.StudentClassesPage })))
const StudentDashboardPage = lazy(() => import('@/pages/student/StudentDashboardPage').then((module) => ({ default: module.StudentDashboardPage })))
const StudentLessonPage = lazy(() => import('@/pages/student/StudentLessonPage').then((module) => ({ default: module.StudentLessonPage })))
const StudentModulePage = lazy(() => import('@/pages/student/StudentModulePage').then((module) => ({ default: module.StudentModulePage })))
const TeacherClassesPage = lazy(() => import('@/pages/teacher/TeacherClassesPage').then((module) => ({ default: module.TeacherClassesPage })))
const TeacherAssignmentDetailPage = lazy(() => import('@/pages/teacher/TeacherAssignmentDetailPage').then((module) => ({ default: module.TeacherAssignmentDetailPage })))
const TeacherAssignmentsPage = lazy(() => import('@/pages/teacher/TeacherAssignmentsPage').then((module) => ({ default: module.TeacherAssignmentsPage })))
const TeacherClassDetailPage = lazy(() => import('@/pages/teacher/TeacherClassDetailPage').then((module) => ({ default: module.TeacherClassDetailPage })))
const TeacherDashboardPage = lazy(() => import('@/pages/teacher/TeacherDashboardPage').then((module) => ({ default: module.TeacherDashboardPage })))
const TeacherLessonPage = lazy(() => import('@/pages/teacher/TeacherLessonPage').then((module) => ({ default: module.TeacherLessonPage })))
const TeacherModulePage = lazy(() => import('@/pages/teacher/TeacherModulePage').then((module) => ({ default: module.TeacherModulePage })))
const TeacherSubmissionPage = lazy(() => import('@/pages/teacher/TeacherSubmissionPage').then((module) => ({ default: module.TeacherSubmissionPage })))

function RouteLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-background px-5"><p className="text-sm text-muted-foreground" role="status">Loading DataClass…</p></main>
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}><Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<RoleRedirect />} />
        <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboardPage /></ProtectedRoute>} />
        <Route path="/teacher/classes" element={<ProtectedRoute role="teacher"><TeacherClassesPage /></ProtectedRoute>} />
        <Route path="/teacher/classes/:classId" element={<ProtectedRoute role="teacher"><TeacherClassDetailPage /></ProtectedRoute>} />
        <Route path="/teacher/classes/:classId/modules/:moduleId" element={<ProtectedRoute role="teacher"><TeacherModulePage /></ProtectedRoute>} />
        <Route path="/teacher/classes/:classId/modules/:moduleId/lessons/:lessonId" element={<ProtectedRoute role="teacher"><TeacherLessonPage /></ProtectedRoute>} />
        <Route path="/teacher/assignments" element={<ProtectedRoute role="teacher"><TeacherAssignmentsPage /></ProtectedRoute>} />
        <Route path="/teacher/assignments/:assignmentId" element={<ProtectedRoute role="teacher"><TeacherAssignmentDetailPage /></ProtectedRoute>} />
        <Route path="/teacher/assignments/:assignmentId/submissions/:submissionId" element={<ProtectedRoute role="teacher"><TeacherSubmissionPage /></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboardPage /></ProtectedRoute>} />
        <Route path="/student/classes" element={<ProtectedRoute role="student"><StudentClassesPage /></ProtectedRoute>} />
        <Route path="/student/classes/:classId" element={<ProtectedRoute role="student"><StudentClassPage /></ProtectedRoute>} />
        <Route path="/student/classes/:classId/modules/:moduleId" element={<ProtectedRoute role="student"><StudentModulePage /></ProtectedRoute>} />
        <Route path="/student/classes/:classId/modules/:moduleId/lessons/:lessonId" element={<ProtectedRoute role="student"><StudentLessonPage /></ProtectedRoute>} />
        <Route path="/student/assignments" element={<ProtectedRoute role="student"><StudentAssignmentsPage /></ProtectedRoute>} />
        <Route path="/student/assignments/:assignmentId" element={<ProtectedRoute role="student"><StudentAssignmentDetailPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes></Suspense>
    </BrowserRouter>
  )
}
