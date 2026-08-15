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

The frontend is organized by reusable UI and layout components, role-specific teacher and student components, routed pages, typed mock data, hooks, shared utilities, assets, and global styles. `App.tsx` is limited to route composition. Frontend mock content remains in `src/data/mockData.ts` and is not connected to the database.

Repository-managed SQL migrations live in `database/migrations`. The current database model is documented in `docs/DATABASE.md`. The workspace is linked to the existing Neon `DataClass` project. Migrations `0001_dataclass_foundation.sql`, `0002_auth_roles_rls.sql`, and `0003_multi_teacher_architecture.sql` were validated on isolated Neon branches before transactional production application. The `dataclass-step-3` branch remains available for rollback/reference.

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

Real Google authentication, secure profile bootstrap, multi-role loading, route protection, and sign-out are complete. Production contains the validated Neon Data API, auth bootstrap, RLS policies, and multi-teacher schema. There is still no live class management, instructor assignment UI, invitation email delivery, object storage, upload flow, YouTube integration, or live lesson/assignment/submission functionality. Class and module authorization policies remain secure default deny until those workflows are implemented and validated.

## Current status

- **Completed:** Step 1 — Foundation & UI Skeleton
- **Completed:** Step 2 — Neon Project + Database Foundation
- **Completed:** Step 3 — Authentication + Role System
- **Migration validation branch retained for review:** `dataclass-step-2`
- **Production status:** validated 15-table foundation, Neon-authenticated Data API, secure student bootstrap, own-profile/own-role RLS, and multi-teacher architecture applied; no application data seeded
- **Step 3 reference branch:** `dataclass-step-3` retained with development-only dual-role test data
- **Authentication architecture:** Google OAuth, secure default-student bootstrap, trusted teacher provisioning, multi-role routing, and sign-out complete
- **Multi-teacher architecture:** class owner/lead teacher, participating class instructors, and multiple module instructors supported
- **Next planned major step:** Step 4 — Class Management + Student Invitations
