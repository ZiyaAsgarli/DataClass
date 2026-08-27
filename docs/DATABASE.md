# DataClass Database

## Overview

DataClass uses Neon Lakebase Postgres. Migration `database/migrations/0001_dataclass_foundation.sql` defines the V1 application foundation in `public`. It was validated on the Neon branch `dataclass-step-2`, created from `production`, and then applied transactionally to production. Production validation confirmed an exact application-schema match and no seeded application data.

`0002_auth_roles_rls.sql` adds the secure authenticated-user bootstrap and own-profile/own-role policies. `0003_multi_teacher_architecture.sql` adds class- and module-level teacher assignments. Both were validated on `dataclass-step-3` and applied transactionally to production. Production and the development branch have matching application/security schemas; development-only identity and role data was not copied.

`0004_class_management.sql` introduces secure class-management RPCs and the first feature-specific RLS policies. It was validated with two real Google identities on `dataclass-step-4`, then applied transactionally to production. Production and development have matching Step 4 function bodies, policies, grants, and RLS state; development-only class, invitation, membership, profile, and role data was not copied.

`0005_modules_lessons.sql` adds the Step 5 module/lesson CRUD, ordering, instructor-assignment, scoped read helpers, and RLS policies. It was validated on `dataclass-step-5` and applied transactionally to production. Production matches the development branch for Step 5 function bodies, policies, constraints, indexes, permissions, and RLS state; no development content or identity data was copied. The migration creates no tables and seeds no content.

`0006_lesson_video.sql` adds canonical YouTube URL validation and scoped lesson-recording read/write functions. It was database- and real-browser-validated on `dataclass-step-6`, then applied transactionally to production. Production and development match for Step 6A function bodies, grants, constraints, and RLS state; no development identities, course content, or recording metadata was copied. The migration reuses the existing lesson video columns, creates no content rows, performs no network requests, and grants no direct lesson writes.

`0007_lesson_resources.sql` extends `lesson_resources` with B2 provider, pending/ready lifecycle, upload time, and ETag metadata; adds deterministic protected object paths; and exposes narrowly scoped prepare, finalize, list, download-authorization, and delete-authorization RPCs. It was database- and real-browser-validated on `dataclass-step-6b`, then applied transactionally to production. Production matches the development branch for Step 6B columns, constraints, indexes, function bodies, grants, policies, and RLS state; no development resource, course, or identity data was copied.

`0008_assignments_submissions.sql` extends the existing assignment-resource and submission-file metadata lifecycles, adds deterministic private object paths and server-authorized assignment/submission RPCs, and opens no direct table writes. It was validated through a definitive two-account workflow on `dataclass-step-7`, then applied transactionally to production. Production matches development for all 29 Step 7 functions, columns, constraints, indexes, grants, policies, and RLS state; no development assignment, file, submission, feedback, identity, or course data was copied.

`0009_module_lifecycle.sql` preserves the existing `modules.status` availability/archive contract and adds the separate `modules.lifecycle_status` course-level Upcoming / Active / Completed teaching lifecycle. Existing rows default to Upcoming without rewriting availability. A partial unique index allows at most one Active teaching lifecycle per class, and an owner-only lifecycle RPC changes only the new column. Student visibility continues to require legacy visible availability (`active` or `completed`); lifecycle cannot expose draft or archived modules. The corrected migration was validated on a disposable pre-Step-8 branch and `dataclass-step-7`, then applied transactionally to production with matching constraints, indexes, functions, grants, policies, and RLS state. No development rows were copied.

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
| `lesson_resources` | Private lesson-file metadata and lifecycle state; file bytes remain in Backblaze B2. |
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

## Step 7 assignment and submission lifecycle

- Assignments remain class-owned and may optionally reference a lesson. Class owners may manage class-level or lesson-linked assignments; assigned module instructors are limited to lesson-linked assignments in their own modules.
- New assignments are drafts. Students can list and open only published assignments belonging to active class memberships. Closing or archiving preserves existing submissions.
- Deadlines use database time. When late work is allowed, submission state records late delivery; when it is disabled, new submission finalization is rejected after the deadline.
- One logical `submissions` row is retained for each `(assignment_id, student_id)`. `draft_version` stabilizes multi-file preparation, while `submission_files.version` preserves each completed submission or resubmission without overwriting earlier files.
- The lifecycle is `draft` → `submitted` or `late` → optionally `revision_requested` → `resubmitted` → `reviewed`. `was_late` preserves the factual late flag after later review-state transitions.
- Feedback is a single editable text note for the V1 review experience. Revision requests require feedback; marking reviewed allows optional feedback. Students cannot write feedback or mutate review state.
- No score, grade, percentage, GPA, passed/failed, or gradebook column is introduced.

## Delete behavior

Dependent content uses `ON DELETE CASCADE` where it has no independent meaning: class invitations and modules, class-teacher links, module-teacher links, module lessons, lesson resources, assignment resources, user role rows, submission files, and submission feedback.

Important identity and academic-history relationships use `ON DELETE RESTRICT`: Auth user to profile, class owner to class, teacher profiles to class/module teacher links, student to class membership, assignment to existing submissions, user to submission, and teacher to feedback. Deleting a class or module removes its participation links, but deleting a profile cannot erase the class or module itself. Classes with memberships and assignments with submissions therefore cannot be casually deleted; lifecycle statuses such as `archived` should be preferred.

Deleting a lesson uses `ON DELETE SET NULL` for its optional assignment link. Deleting a class can cascade its empty course structure and assignments, but membership and submission restrictions prevent erasing active or historical participation transitively.

## Row Level Security

RLS is enabled on all 15 application tables. In production, `profiles` and `user_roles` expose only the authenticated user's own rows. `classes`, `class_members`, `class_invitations`, and `class_teachers` have narrow SELECT policies for authorized owners, participating instructors, or members. `modules`, `lessons`, and `module_teachers` have narrow authenticated SELECT policies for class/module teachers or active class members, with students restricted to visible module states and published lessons. Mutations are available only through locked-down `SECURITY DEFINER` functions with `search_path = pg_catalog`; no direct client mutation policy exists. Policy helper functions avoid recursive RLS evaluation. Student lists and instructor lookup use scoped functions rather than weakening profile privacy. No anonymous, `USING (true)`, or `WITH CHECK (true)` policy is used. Later feature tables remain default deny until their implementation steps.

### Step 4 function boundary

- Class owners may update/archive a class, manage pending student invitations, and add/remove additional instructors.
- Participating instructors may view class details and membership but cannot manage ownership, invitations, or instructors.
- Students may list and open only classes for which their own active/completed membership exists.
- `invited_by`, class owner, claim email, and claim student ID are always derived database-side; browser input cannot spoof them.
- Invitation input is normalized to lowercase, existing members and the owner are rejected, and the partial unique index prevents duplicate pending invitations.
- `remove_class_instructor()` only removes rows with role `instructor`; the owner row cannot be removed and ownership transfer is not implemented.

### Step 5 production boundary

- `create_module()`, `update_module()`, and `reorder_module()` derive authorization from `auth.uid()`; only the class owner creates/reorders modules, while assigned module instructors may edit educational fields without controlling lifecycle state.
- `assign_module_instructor()` accepts only a teacher already present in the same class through `class_teachers` and already holding the trusted `teacher` role. It never provisions or elevates roles.
- `create_lesson()`, `update_lesson()`, and `reorder_lesson()` permit the class owner or an assigned instructor for that module. Lesson `module_id` cannot be reassigned through these operations.
- Module and lesson ordering uses locked, collision-safe integer swaps. Positions remain non-negative and unique within their parent.
- Students can read only active/completed modules in their own active/completed class memberships and only lessons with status `published`. Draft and archived lessons remain hidden.
- Teacher and student read helpers expose only scoped content and instructor names; they accept resource IDs but never a caller-controlled user ID. All 21 Step 5 functions are authenticated-only `SECURITY DEFINER` functions with `search_path = pg_catalog`.
- Direct authenticated inserts, updates, and deletes on `modules`, `lessons`, and `module_teachers` remain unavailable. Their RLS policies are narrow SELECT policies only.

### Step 8 production boundary

- `modules.status` remains the legacy availability/archive state with `draft`, `active`, `completed`, and `archived`; its original `draft` default and visibility semantics are preserved. Owner archive/restore behavior remains available through `update_module()`.
- `modules.lifecycle_status` is a separate non-null teaching lifecycle with `upcoming`, `active`, and `completed`, defaulting existing and new rows to `upcoming` without inferring from legacy availability.
- `modules_one_active_lifecycle_per_class_idx` is a partial unique index on `class_id WHERE lifecycle_status = 'active'`. The lifecycle RPC also returns the domain error “Another module is already active for this class.” rather than silently changing another module.
- `set_module_lifecycle()` accepts a module ID and lifecycle value only. It derives the authenticated user through `auth.uid()`, requires class ownership, uses `SECURITY DEFINER` with `search_path = pg_catalog`, and is executable only by `authenticated`.
- Assigned module instructors may continue editing module educational fields through `update_module()` but cannot change availability or lifecycle. Owners retain availability controls separately from teaching lifecycle. Students and unrelated teachers receive no direct module write privileges.
- Student reads still require `modules.status IN ('active', 'completed')`. Within that authorized set, Upcoming, Active, and Completed lifecycle badges describe teaching progression. Draft/archived modules remain hidden regardless of lifecycle, and published lesson status remains the lesson visibility gate.
- Database constraints and trusted RPC checks prevent an archived/draft-hidden module from becoming the Active teaching module. Archiving an Active teaching module is rejected until the owner intentionally changes its lifecycle.
- The `dataclass-step-7` data state is Excel Completed with SQL, Power BI, and Python Upcoming. No Active module is currently selected. These rows are development data and are not part of migration `0009` or production.
- Step 8 adds no per-student completion, watched state, progress percentage, attendance, grading, scheduling, or Admin role.

### Step 9.2 submission-avatar boundary

- Migration `0010_submission_student_avatar.sql` extends only `get_submission_detail(uuid)` with `student_avatar_url`, sourced from the already-authorized submission student's `profiles.avatar_url`.
- The function retains its original student-owner or authorized-assignment-teacher predicate, `SECURITY DEFINER` mode, `search_path = pg_catalog`, and authenticated-only execution. Anonymous and PUBLIC execution remain revoked.
- Profile RLS and grants are unchanged. No general profile search/avatar RPC or unrelated profile field is exposed; provider metadata, tokens, and internal auth data remain outside the contract.
- The UI maps the optional field to `SubmissionDetail.avatarUrl` and falls back to initials for missing or failed images. This change adds no grading, file-preview backend, submission transition, or storage behavior.

### Step 6A production boundary

- `youtube_video_identity()` accepts strict HTTPS YouTube watch, `youtu.be`, and Shorts URLs with valid 11-character video IDs, then returns a canonical `https://www.youtube.com/watch?v=...` URL. Malformed or lookalike hosts are rejected without fetching any remote URL.
- `set_lesson_youtube_video()` and `remove_lesson_video()` derive the current user through `auth.uid()` and require `can_manage_module()`, limiting writes to the class owner or an assigned instructor for that lesson's module. Attaching a recording never changes lesson publication status.
- `get_teacher_lesson_video()` requires teacher access to the lesson. `get_student_lesson_video()` requires active class membership, a visible module state, and a published lesson; it returns the derived video ID without exposing the raw URL to the student UI.
- All five Step 6A functions use `SECURITY DEFINER` with `search_path = pg_catalog`. Only the four application RPCs are executable by `authenticated`; anonymous and PUBLIC execution is revoked, and the validation helper is internal.
- The lesson table retains RLS and has no direct authenticated INSERT, UPDATE, or DELETE grant. Conditional checks keep YouTube URLs canonical while leaving the provider column extensible for future providers.

### Step 6B private-resource security

- `prepare_lesson_resource_upload()` derives the caller through `auth.uid()`, permits only the class owner or assigned module instructor, validates the supported extension and exact resource kind, enforces a non-zero 500 MiB maximum, generates the resource UUID and opaque object path, and creates a `pending` row. It accepts no caller identity or storage path.
- Finalization is split across `get_lesson_resource_upload_state()` and `finalize_lesson_resource_upload()`. The Worker receives the exact protected path, verifies the object with B2 `HeadObject`, checks its expected size, records only the safe ETag, and then marks the row `ready` with `uploaded_at`.
- Teacher and student list functions expose only `ready` metadata. Students additionally require active class membership, a visible module, and a published lesson. Pending resources and draft lesson resources remain hidden.
- Download and delete authorization functions return the exact stored path only after database authorization. Student downloads retain published-lesson membership checks; delete remains limited to the class owner or assigned module instructor. No function accepts a browser-provided object path or user ID.
- All eight application functions use `SECURITY DEFINER` with `search_path = pg_catalog`, are executable only by `authenticated`, and leave direct `lesson_resources` table writes unavailable. RLS remains enabled and no broad policy was added.

### Step 7 production security boundary

- All Step 7 mutations and scoped reads use authenticated-only `SECURITY DEFINER` RPCs with `search_path = pg_catalog` and identity derived through `auth.uid()`. No function accepts a caller user/teacher/student identity or a storage path.
- Assignment-resource and submission-file preparation validates the shared file allowlist, non-zero size, and 500 MiB limit, then creates an opaque database-generated B2 path. Finalization remains contingent on Worker `HeadObject` size verification.
- Students can prepare files only for their own logical submission, cannot submit after a disallowed deadline, cannot inspect other students, and cannot review themselves. Teachers see non-draft submissions only when they own the class or teach the assignment's linked module.
- Ready assignment resources are visible to students only for authorized published assignments. Submission files and feedback are visible only to the submitting student and authorized teacher. Pending file metadata is never student-visible.
- RLS remains enabled on `assignments`, `assignment_resources`, `submissions`, `submission_files`, and `submission_feedback`; their direct authenticated table privileges are revoked and no broad policy was added.

## File and video storage

- Physical classroom recordings are created with OBS and later uploaded to YouTube as **Unlisted** videos.
- PostgreSQL stores only provider, URL, duration, publishing, and related metadata. OBS video binaries are never stored in PostgreSQL.
- Unlisted YouTube is link-accessible, not DRM or private object storage. Application authorization protects lesson metadata but does not make possession of a YouTube link private.
- Step 6B lesson files use a private Backblaze B2 bucket. The Cloudflare Worker holds bucket credentials, forwards the user's Neon bearer token to scoped authorization RPCs, signs five-minute PUT and two-minute GET URLs, and verifies uploads with `HeadObject`. Browser file bytes travel directly to B2; the Worker does not proxy normal file bodies.
- PostgreSQL stores paths, names, sizes, MIME types, provider/lifecycle data, and safe ETags only. It never stores file bodies, credentials, permanent B2 URLs, or presigned URLs.
- Supported V1 lesson-resource extensions are `.xlsx`, `.xls`, `.xlsm`, `.csv`, `.tsv`, `.pdf`, `.pbix`, `.pbit`, `.sql`, `.ipynb`, `.py`, `.txt`, `.json`, `.parquet`, `.zip`, `.docx`, and `.pptx`; files must be between 1 byte and 500 MiB. Obvious executable/script installer formats are rejected by the allowlist.
- Step 7 reuses the same private B2/Worker design for assignment resources and versioned submission files. Pending upload cleanup is deferred maintenance.

## Environment and migration safety

Local connection values are held in ignored `.env.local` variables such as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; Worker secrets are held in ignored `.dev.vars`. Documentation and source files contain no credentials. Schema migrations use direct/unpooled connections and must first be tested on a child branch. Migrations `0001` through `0010` are present and validated in production. The retained development branches remain rollback/reference environments, and development-only E2E data is never promoted. Cloudflare Worker production deployment and production-origin B2 CORS remain deferred until DataClass has a real deployed origin.
