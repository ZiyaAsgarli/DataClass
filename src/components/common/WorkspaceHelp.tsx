import { BookOpen, CheckCircle2, CircleHelp, ClipboardList, PlayCircle, Route, Users } from 'lucide-react'
import { DialogFrame } from '@/components/common/CourseForms'
import type { UserRole } from '@/types'

const teacherItems = [
  { icon: BookOpen, title: 'Create a class', detail: 'Set up the learning space for a cohort.' },
  { icon: Users, title: 'Invite students', detail: 'Add their email addresses from the class page.' },
  { icon: Route, title: 'Add modules and lessons', detail: 'Build the ordered course structure students will follow.' },
  { icon: PlayCircle, title: 'Add lesson recordings', detail: 'Attach an Unlisted YouTube recording to a lesson.' },
  { icon: ClipboardList, title: 'Publish assignments', detail: 'Add task files, then make coursework available.' },
  { icon: CheckCircle2, title: 'Review submissions', detail: 'Give feedback, request revisions, or mark work reviewed.' },
  { icon: Route, title: 'Set teaching status', detail: 'Use Active when teaching begins and Completed when a module finishes.' },
]

const studentItems = [
  { icon: BookOpen, title: 'Open your classes', detail: 'Follow the learning path; completed modules remain available for review.' },
  { icon: PlayCircle, title: 'Watch lesson recordings', detail: 'Open published lessons to watch classroom recordings.' },
  { icon: BookOpen, title: 'Download resources', detail: 'Access files shared with lessons and assignments.' },
  { icon: ClipboardList, title: 'Download task files', detail: 'Open an assignment to get its instructions and files.' },
  { icon: CheckCircle2, title: 'Submit your work', detail: 'Upload one or more solution files, then submit.' },
  { icon: CircleHelp, title: 'Respond to revision feedback', detail: 'When revision is requested, upload a corrected version.' },
  { icon: Route, title: 'Review completed modules', detail: 'Completed teaching modules remain available from your class.' },
]

export function WorkspaceHelp({ role, onClose }: { role: UserRole; onClose: () => void }) {
  const items = role === 'teacher' ? teacherItems : studentItems
  return (
    <DialogFrame title={`${role === 'teacher' ? 'Teacher' : 'Student'} guide`} description="A quick guide to the main DataClass workflow." onClose={onClose} className="max-w-2xl">
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, title, detail }, index) => (
          <li key={title} className="flex gap-3 rounded-xl border bg-muted/30 p-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true"><Icon className="size-4" /></span>
            <div className="min-w-0"><p className="text-sm font-semibold"><span className="sr-only">Step {index + 1}: </span>{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div>
          </li>
        ))}
      </ol>
    </DialogFrame>
  )
}
