import { Plus } from 'lucide-react'
import { ClassCard } from '@/components/teacher/ClassCard'
import { Button } from '@/components/ui/button'
import { classes } from '@/data/mockData'
import { AppShell } from '@/layouts/AppShell'

export function TeacherClassesPage() {
  return <AppShell role="teacher" title="Classes"><div className="animate-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Teaching workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">My Classes</h1><p className="mt-2 text-sm text-muted-foreground">Manage your active course cohorts in one place.</p></div><Button disabled title="Class creation will be added in a later step"><Plus />Create class</Button></div><div className="animate-enter-delay mt-8 grid gap-5 xl:grid-cols-2">{classes.map((course) => <ClassCard key={course.id} course={course} />)}</div></AppShell>
}
