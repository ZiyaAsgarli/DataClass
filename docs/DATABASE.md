# DataClass Database

## Overview

DataClass uses Neon Lakebase Postgres. Migration `database/migrations/0001_dataclass_foundation.sql` defines the V1 application schema in `public`. It was validated on the Neon branch `dataclass-step-2`, created from `production`, and then applied transactionally to production. Production validation confirmed an exact application-schema match between both branches and no seeded application data. The development branch remains available for review.

Neon Auth is the identity provider. Inspection of the linked project confirmed that the canonical user record is `neon_auth."user"`, whose `id` is a UUID primary key. `public.profiles.id` references that exact column. DataClass does not duplicate authentication users or store passwords.

Profile creation/synchronization is deferred to Step 3. No database trigger writes into `public.profiles` from the managed Neon Auth schema because the application auth lifecycle has not yet been integrated and validated.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | Application-facing name, normalized email, and avatar metadata linked one-to-one to Neon Auth users. |
| `user_roles` | Teacher/student role assignments; a composite key permits multiple roles per user. |
| `classes` | Course groups or batches owned by a teacher. |
| `class_members` | Unique student membership within a class. Attendance is intentionally not represented. |
| `class_invitations` | Normalized email invitations and their lifecycle; no email delivery is implemented. |
| `modules` | Ordered, class-specific course sections. Topic names are content, not platform constraints. |
| `lessons` | Ordered physical-classroom lessons and optional video metadata. |
| `lesson_resources` | Metadata for future stored files or external lesson links. |
| `assignments` | Class-level or optional lesson-linked tasks, with no numeric grading fields. |
| `assignment_resources` | Metadata for future stored files or external assignment links. |
| `submissions` | One logical submission per assignment and student. |
| `submission_files` | Multiple submission files with version numbers for resubmission history. |
| `submission_feedback` | One editable teacher feedback record per submission; not a chat system. |

## Relationships and integrity

- `profiles.id` references the verified `neon_auth."user".id` UUID primary key.
- `user_roles` uses primary key `(user_id, role)` and restricts V1 roles to `teacher` and `student`.
- Classes reference their teacher profile; memberships uniquely constrain `(class_id, student_id)`.
- Pending invitations are unique per `(class_id, email)`. Profile and invitation emails must be trimmed lowercase values.
- Module, lesson, and resource positions are non-negative and unique within their parent. Position constraints are deferrable to support reordering.
- Status checks constrain each lifecycle to its documented values without using PostgreSQL enum types.
- `assignments.lesson_id` is optional. Deleting a lesson sets it to null so a class-level assignment can remain.
- `submissions` uniquely constrain `(assignment_id, student_id)`; resubmissions update the logical submission and add versioned files.
- File sizes and video durations cannot be negative. Submission file versions start at 1.
- Assignment-to-lesson class consistency must be checked by application services in the later assignment step; the normalized lesson path reaches a class through its module.
- A shared `public.set_updated_at()` trigger function is attached only to tables with an `updated_at` column.

## Delete behavior

Dependent content uses `ON DELETE CASCADE` where it has no independent meaning: class invitations and modules, module lessons, lesson resources, assignment resources, user role rows, submission files, and submission feedback.

Important identity and academic-history relationships use `ON DELETE RESTRICT`: Auth user to profile, teacher to class, student to class membership, assignment to existing submissions, user to submission, and teacher to feedback. Classes with memberships and assignments with submissions therefore cannot be casually deleted; lifecycle statuses such as `archived` should be preferred.

Deleting a lesson uses `ON DELETE SET NULL` for its optional assignment link. Deleting a class can cascade its empty course structure and assignments, but membership and submission restrictions prevent erasing active or historical participation transitively.

## Row Level Security

RLS is enabled on all 13 public application tables. No policies are present in Step 2, so Data API/application roles receive the secure default deny behavior rather than anonymous or permissive access. Database owners retain PostgreSQL's normal owner bypass for migrations and administration.

Role-aware policies are intentionally deferred to Step 3, when Neon Auth session behavior and the Data API are integrated. Production inspection found no current `auth.user_id()` function. Step 3 must enable/inspect the actual Neon Data API authorization infrastructure and validate the authenticated-user function before policies reference it. No Supabase functions or conventions are used.

## File and video storage

- Physical classroom recordings are created with OBS and later uploaded to YouTube as **Unlisted** videos.
- PostgreSQL stores only provider, URL, duration, publishing, and related metadata. OBS video binaries are never stored in PostgreSQL.
- Lesson, assignment, and submission files will use future object storage. PostgreSQL stores paths, names, sizes, MIME types, versions, and external URLs only.
- Object storage, uploads, and YouTube integration are not implemented in Step 2.

## Environment and migration safety

Local connection values are held in ignored `.env.local` variables such as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; documentation and source files contain no credentials. Schema migrations use direct/unpooled connections and must first be tested on a child branch. Migration `0001` is present in production; future migrations require the same explicit branch validation and production-application process.
