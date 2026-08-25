import { BookOpen, CheckCircle2, CircleHelp, ClipboardList, Users } from 'lucide-react'
import { DialogFrame } from '@/components/common/CourseForms'
import type { UserRole } from '@/types'

const teacherItems = [
  { icon: BookOpen, title: 'Create a class', detail: 'Set up the learning space for a cohort.' },
  { icon: Users, title: 'Invite students', detail: 'Add their email addresses from the class page.' },
  { icon: BookOpen, title: 'Add lessons', detail: 'Set teaching status to Active when a module begins and Completed when it finishes.' },
  { icon: ClipboardList, title: 'Publish an assignment', detail: 'Add task files, then make the assignment available.' },
  { icon: CheckCircle2, title: 'Review submissions', detail: 'Give feedback, request revisions, or mark work reviewed.' },
]

const studentItems = [
  { icon: BookOpen, title: 'Open your classes', detail: 'Follow the learning path; completed modules remain available for review.' },
  { icon: BookOpen, title: 'Access lesson resources', detail: 'Watch recordings and download shared course files.' },
  { icon: ClipboardList, title: 'Download task files', detail: 'Open an assignment to get its instructions and files.' },
  { icon: CheckCircle2, title: 'Submit your work', detail: 'Upload one or more solution files, then submit.' },
  { icon: CircleHelp, title: 'Respond to feedback', detail: 'When revision is requested, upload a corrected version.' },
]

export function WorkspaceHelp({ role, onClose }: { role: UserRole; onClose: () => void }) {
  const items = role === 'teacher' ? teacherItems : studentItems
  return (
    <DialogFrame title={`${role === 'teacher' ? 'Teacher' : 'Student'} guide`} description="A quick guide to the main DataClass workflow." onClose={onClose}>
      <ol className="mt-6 space-y-3">
        {items.map(({ icon: Icon, title, detail }, index) => (
          <li key={title} className="flex gap-3 rounded-lg border bg-muted/30 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary" aria-hidden="true"><Icon className="size-4" /></span>
            <div className="min-w-0"><p className="text-sm font-semibold"><span className="sr-only">Step {index + 1}: </span>{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div>
          </li>
        ))}
      </ol>
    </DialogFrame>
  )
}
