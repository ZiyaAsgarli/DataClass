import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, RoleRedirect } from '@/components/auth/RouteAccess'
import { LoginPage } from '@/pages/auth/LoginPage'
import { NotFoundPage } from '@/pages/shared/NotFoundPage'
import { StudentClassPage } from '@/pages/student/StudentClassPage'
import { StudentClassesPage } from '@/pages/student/StudentClassesPage'
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage'
import { TeacherClassesPage } from '@/pages/teacher/TeacherClassesPage'
import { TeacherClassDetailPage } from '@/pages/teacher/TeacherClassDetailPage'
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<RoleRedirect />} />
        <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboardPage /></ProtectedRoute>} />
        <Route path="/teacher/classes" element={<ProtectedRoute role="teacher"><TeacherClassesPage /></ProtectedRoute>} />
        <Route path="/teacher/classes/:classId" element={<ProtectedRoute role="teacher"><TeacherClassDetailPage /></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboardPage /></ProtectedRoute>} />
        <Route path="/student/classes" element={<ProtectedRoute role="student"><StudentClassesPage /></ProtectedRoute>} />
        <Route path="/student/classes/:classId" element={<ProtectedRoute role="student"><StudentClassPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
