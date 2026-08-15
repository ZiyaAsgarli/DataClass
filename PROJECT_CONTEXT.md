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

Repository-managed SQL migrations live in `database/migrations`. The current database model is documented in `docs/DATABASE.md`. The workspace is linked to the existing Neon `DataClass` project. Migration `0001_dataclass_foundation.sql` was validated on the isolated `dataclass-step-2` branch before being applied transactionally to production.

## Delivery model

- Lessons take place physically in a classroom.
- The teacher records the classroom computer with OBS.
- Recordings will be uploaded to YouTube as Unlisted videos.
- DataClass stores video URLs and metadata only, never OBS video files in PostgreSQL.
- Course and submission files will use future object storage; PostgreSQL stores metadata only.
- Current course content includes Excel, SQL, Power BI, and Python, but these are configurable values rather than hardcoded platform rules.

## Roles

- **Teacher:** manages classes, course content, assignments, student participation, reviews, and written feedback.
- **Student:** joins invited classes, follows lessons, completes assignments, submits and resubmits files, and reviews progress and feedback.
- A user may hold multiple application roles through `public.user_roles`.

## Explicit exclusions

- Attendance is managed externally by the training center and is not part of DataClass.
- V1 has no numeric grades, scores, GPA, gradebook, or certificates.
- PostgreSQL stores no file or video binary data.

## Intentionally not implemented yet

There is no real login flow, Google OAuth UI, route protection, profile synchronization, Data API integration, invitation email delivery, object storage, upload flow, YouTube integration, or live class/lesson/assignment/submission functionality. Final RLS authorization policies are deferred until Step 3 validates Neon Auth and Data API session behavior.

## Current status

- **Completed:** Step 1 — Foundation & UI Skeleton
- **Completed:** Step 2 — Neon Project + Database Foundation
- **Migration validation branch retained for review:** `dataclass-step-2`
- **Production status:** validated 13-table foundation applied; no application data seeded
- **Authentication integration status:** not implemented; final RLS policies remain deferred
- **Next planned step:** Step 3 — Authentication + Role System
