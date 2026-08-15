# DataClass Database

## Overview

DataClass uses Neon Lakebase Postgres. Migration `database/migrations/0001_dataclass_foundation.sql` defines the V1 application foundation in `public`. It was validated on the Neon branch `dataclass-step-2`, created from `production`, and then applied transactionally to production. Production validation confirmed an exact application-schema match and no seeded application data.

`0002_auth_roles_rls.sql` adds the secure authenticated-user bootstrap and own-profile/own-role policies. `0003_multi_teacher_architecture.sql` adds class- and module-level teacher assignments. Both were validated on `dataclass-step-3` and applied transactionally to production. Production and the development branch have matching application/security schemas; development-only identity and role data was not copied.

`0004_class_management.sql` introduces secure class-management RPCs and the first feature-specific RLS policies. It was validated with two real Google identities on `dataclass-step-4`, then applied transactionally to production. Production and development have matching Step 4 function bodies, policies, grants, and RLS state; development-only class, invitation, membership, profile, and role data was not copied.

Neon Auth is the identity provider. Inspection of the linked project confirmed that the canonical user record is `neon_auth."user"`, whose `id` is a UUID primary key. `public.profiles.id` references that exact column. DataClass does not duplicate authentication users or store passwords.

In production and development, `public.bootstrap_current_user()` securely identifies the current Neon Auth user through `auth.uid()`, reads authoritative identity data from `neon_auth."user"`, creates or refreshes the linked profile, and assigns `student` only when the user has no application role. It is idempotent, accepts no user identifier, never grants `teacher`, uses `SECURITY DEFINER` with `search_path = pg_catalog`, and is executable only by `authenticated`. Teacher roles remain trusted/admin-provisioned. No trigger writes from the managed Neon Auth schema.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | Application-facing name, normalized email, and avatar metadata linked one-to-one to Neon Auth users. |
| `user_roles` | Teacher/student role assignments; a composite key permits multiple roles per user. |
| `classes` | Course groups or batches. `teacher_id` is the canonical class owner/lead teacher. |
| `class_teachers` | All owner/instructor profiles participating in a class. |
| `class_members` | Unique student membership within a class. Attendance is intentionally not represented. |
| `class_invitations` | Normalized email invitations and their lifecycle; no email delivery is implemented. |
| `modules` | Ordered, class-specific course sections. Topic names are content, not platform constraints. |
| `module_teachers` | One or more teacher profiles responsible for an individual module. |
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
- `classes.teacher_id` references the canonical class owner/lead teacher. It does not imply that the owner teaches every module.
- `class_teachers` uniquely constrains `(class_id, teacher_id)`, permits only `owner` or `instructor`, and permits at most one `owner` row per class. When class workflows are implemented, the service must keep that owner row consistent with `classes.teacher_id`.
- `module_teachers` uniquely constrains `(module_id, teacher_id)`, allowing a module to have multiple teachers without duplicate assignments.
- PostgreSQL cannot express "the referenced profile must already have a teacher row in `user_roles`" as a normal foreign key or row-local check constraint. Trusted administration and future application services must validate the teacher role before class/module assignment and must ensure a module teacher also participates in that module's class through `class_teachers`. No trigger grants or elevates roles.
- Class memberships uniquely constrain `(class_id, student_id)`.
- Pending invitations are unique per `(class_id, email)`. Profile and invitation emails must be trimmed lowercase values.
- `create_class()` atomically creates an active class and its owner `class_teachers` row; it derives ownership from `auth.uid()` and requires an existing teacher role.
- `claim_my_class_invitations()` accepts no identity arguments. It reads the authenticated Neon user's authoritative email, creates or reactivates that user's membership, and accepts matching pending invitations idempotently.
- Instructor lookup is performed inside `add_class_instructor_by_email()`. Only the class owner can call it, and the target profile must already hold a trusted `teacher` role. The function never grants roles or exposes general profile enumeration.
- Module, lesson, and resource positions are non-negative and unique within their parent. Position constraints are deferrable to support reordering.
- Status checks constrain each lifecycle to its documented values without using PostgreSQL enum types.
- `assignments.lesson_id` is optional. Deleting a lesson sets it to null so a class-level assignment can remain.
- `submissions` uniquely constrain `(assignment_id, student_id)`; resubmissions update the logical submission and add versioned files.
- File sizes and video durations cannot be negative. Submission file versions start at 1.
- Assignment-to-lesson class consistency must be checked by application services in the later assignment step; the normalized lesson path reaches a class through its module.
- A shared `public.set_updated_at()` trigger function is attached only to tables with an `updated_at` column.

## Delete behavior

Dependent content uses `ON DELETE CASCADE` where it has no independent meaning: class invitations and modules, class-teacher links, module-teacher links, module lessons, lesson resources, assignment resources, user role rows, submission files, and submission feedback.

Important identity and academic-history relationships use `ON DELETE RESTRICT`: Auth user to profile, class owner to class, teacher profiles to class/module teacher links, student to class membership, assignment to existing submissions, user to submission, and teacher to feedback. Deleting a class or module removes its participation links, but deleting a profile cannot erase the class or module itself. Classes with memberships and assignments with submissions therefore cannot be casually deleted; lifecycle statuses such as `archived` should be preferred.

Deleting a lesson uses `ON DELETE SET NULL` for its optional assignment link. Deleting a class can cascade its empty course structure and assignments, but membership and submission restrictions prevent erasing active or historical participation transitively.

## Row Level Security

RLS is enabled on all 15 application tables. In production, `profiles` and `user_roles` expose only the authenticated user's own rows. `classes`, `class_members`, `class_invitations`, and `class_teachers` have narrow SELECT policies for authorized owners, participating instructors, or members. Mutations are available only through locked-down `SECURITY DEFINER` functions with `search_path = pg_catalog`; no direct client mutation policy exists. Policy helper functions avoid recursive RLS evaluation. Student lists and instructor email lookup use scoped functions rather than weakening profile privacy. No anonymous, `USING (true)`, or `WITH CHECK (true)` policy is used. Modules and every later feature table remain default deny.

### Step 4 function boundary

- Class owners may update/archive a class, manage pending student invitations, and add/remove additional instructors.
- Participating instructors may view class details and membership but cannot manage ownership, invitations, or instructors.
- Students may list and open only classes for which their own active/completed membership exists.
- `invited_by`, class owner, claim email, and claim student ID are always derived database-side; browser input cannot spoof them.
- Invitation input is normalized to lowercase, existing members and the owner are rejected, and the partial unique index prevents duplicate pending invitations.
- `remove_class_instructor()` only removes rows with role `instructor`; the owner row cannot be removed and ownership transfer is not implemented.

## File and video storage

- Physical classroom recordings are created with OBS and later uploaded to YouTube as **Unlisted** videos.
- PostgreSQL stores only provider, URL, duration, publishing, and related metadata. OBS video binaries are never stored in PostgreSQL.
- Lesson, assignment, and submission files will use future object storage. PostgreSQL stores paths, names, sizes, MIME types, versions, and external URLs only.
- Object storage, uploads, and YouTube integration are not implemented in Step 2.

## Environment and migration safety

Local connection values are held in ignored `.env.local` variables such as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; documentation and source files contain no credentials. Schema migrations use direct/unpooled connections and must first be tested on a child branch. Migrations `0001` through `0004` are present and validated in production. The retained `dataclass-step-3` and `dataclass-step-4` branches remain rollback/reference environments; `dataclass-step-4` contains development-only E2E data that was never promoted.
