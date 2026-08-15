import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { NotFoundPage } from '@/pages/shared/NotFoundPage'
import { StudentClassPage } from '@/pages/student/StudentClassPage'
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage'
import { TeacherClassesPage } from '@/pages/teacher/TeacherClassesPage'
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/teacher" element={<TeacherDashboardPage />} />
        <Route path="/teacher/classes" element={<TeacherClassesPage />} />
        <Route path="/student" element={<StudentDashboardPage />} />
        <Route path="/student/classes/:classId" element={<StudentClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
