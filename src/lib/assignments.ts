import type { AssignmentRecord, AssignmentStatus, SubmissionStatus } from '@/types'

export function formatDateTime(value: string | null | undefined, fallback = 'No due date') {
  if (!value) return fallback
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function assignmentStatusLabel(status: AssignmentStatus) {
  return ({ draft: 'Draft', published: 'Published', closed: 'Closed', archived: 'Archived' } as const)[status]
}

export function submissionLabel(status: SubmissionStatus | null | undefined) {
  if (!status || status === 'draft') return 'Not submitted'
  return ({
    submitted: 'Submitted', late: 'Late', reviewed: 'Reviewed',
    revision_requested: 'Revision requested', resubmitted: 'Resubmitted',
  } as const)[status]
}

export function studentAssignmentLabel(assignment: AssignmentRecord) {
  if (assignment.submissionStatus && assignment.submissionStatus !== 'draft') return submissionLabel(assignment.submissionStatus)
  if (!assignment.dueAt) return 'Not submitted'
  const remaining = new Date(assignment.dueAt).getTime() - Date.now()
  if (remaining < 0) return assignment.allowLateSubmission ? 'Late submission available' : 'Deadline passed'
  if (remaining <= 2 * 86400000) return 'Due soon'
  return 'Upcoming'
}
