# DataClass Project Context

## Product purpose

DataClass is a professional digital workspace for an in-person Data Analytics course. Teachers organize class groups, classroom lessons, course resources, assignments, submissions, reviews, and written feedback. Students follow the course structure, submit work, and review progress and feedback.

## Current stack

- React 19 with TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui-compatible component architecture
- React Router and Lucide icons
- Neon Lakebase Postgres
- Neon Auth
- npm

## Current architecture

The frontend is organized by reusable UI and layout components, role-specific teacher and student components, routed pages, typed domain data, services, hooks, shared utilities, assets, and global styles. `App.tsx` is limited to route composition. Class management now uses a dedicated Neon service layer; later course content remains mock-free or clearly marked as unavailable.

Repository-managed SQL migrations live in `database/migrations`. The current database model is documented in `docs/DATABASE.md`. The workspace is linked to the existing Neon `DataClass` project. Migrations `0001_dataclass_foundation.sql` through `0004_class_management.sql` were validated on isolated Neon branches before transactional production application. The `dataclass-step-3` and `dataclass-step-4` branches remain available for rollback/reference.

## Delivery model

- Lessons take place physically in a classroom.
- The teacher records the classroom computer with OBS.
- Recordings will be uploaded to YouTube as Unlisted videos.
- DataClass stores video URLs and metadata only, never OBS video files in PostgreSQL.
- Course and submission files will use future object storage; PostgreSQL stores metadata only.
- Current course content includes Excel, SQL, Power BI, and Python, but these are configurable values rather than hardcoded platform rules.
- A single Data Analytics class may have different teachers for Excel, SQL, Power BI, Python, or any future module. A class retains one owner/lead teacher while modules support one or more assigned instructors.

## Roles

- **Teacher:** may own/lead a class, participate as a class instructor, and teach one or more assigned modules. Teachers later manage authorized course content, assignments, student participation, reviews, and written feedback.
- **Student:** joins invited classes, follows lessons, completes assignments, submits and resubmits files, and reviews progress and feedback.
- A user may hold multiple application roles through `public.user_roles`.
- Teacher-role provisioning remains trusted/admin-controlled. Assigning a profile to `class_teachers` or `module_teachers` must validate that the profile already has the `teacher` application role; assignment never grants that role.

## Explicit exclusions

- Attendance is managed externally by the training center and is not part of DataClass.
- V1 has no numeric grades, scores, GPA, gradebook, or certificates.
- PostgreSQL stores no file or video binary data.

## Intentionally not implemented yet

Real Google authentication, secure profile bootstrap, multi-role loading, route protection, sign-out, class management, owner-controlled bulk invitations, authenticated invitation claiming, membership views, and existing-teacher instructor assignment are complete. Production contains the validated Neon Data API, auth bootstrap, multi-teacher schema, and Step 4 class-management RLS/functions. External invitation email delivery, modules, lessons, object storage, uploads, YouTube integration, assignments, and submissions remain intentionally unimplemented.

## Current status

- **Completed:** Step 1 — Foundation & UI Skeleton
- **Completed:** Step 2 — Neon Project + Database Foundation
- **Completed:** Step 3 — Authentication + Role System
- **Completed:** Step 4 — Class Management + Student Invitations
- **Migration validation branch retained for review:** `dataclass-step-2`
- **Production status:** validated 15-table foundation, Neon-authenticated Data API, secure student bootstrap, own-profile/own-role RLS, multi-teacher architecture, and Step 4 class-management schema/security applied; no application data seeded
- **Step 3 reference branch:** `dataclass-step-3` retained with development-only dual-role test data
- **Authentication architecture:** Google OAuth, secure default-student bootstrap, trusted teacher provisioning, multi-role routing, and sign-out complete
- **Multi-teacher architecture:** class owner/lead teacher, participating class instructors, and multiple module instructors supported
- **Step 4 validation:** two real Google identities completed teacher class creation, secure invitation, first-login bootstrap, automatic claim, active membership, student visibility, and teacher member-count verification on `dataclass-step-4`
- **Step 4 security model:** class creation derives the owner from Neon Auth, invitation claiming derives the student and email from Neon Auth, and instructor assignment requires an existing trusted teacher role
- **Authentication initialization:** React StrictMode remains enabled; concurrent initialization calls share one in-flight promise while preserving session → bootstrap → invitation claim → profile/roles → workspace ordering
- **Step 4 reference branch:** `dataclass-step-4` retained with development-only two-account test data
- **Next planned major step:** Step 5 — Course Modules + Lessons
