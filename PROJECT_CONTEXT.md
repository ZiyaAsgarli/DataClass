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
- Cloudflare Workers (private resource authorization and URL signing)
- Backblaze B2 private object storage (lesson resource bytes)

## Current architecture

The frontend is organized by reusable UI and layout components, role-specific teacher and student components, routed pages, typed domain data, services, hooks, shared utilities, assets, and global styles. `App.tsx` is limited to route composition. Class, module, and lesson management use dedicated typed Neon service layers; later course features remain mock-free or clearly marked as unavailable.

Repository-managed SQL migrations live in `database/migrations`. The current database model is documented in `docs/DATABASE.md`. The workspace is linked to the existing Neon `DataClass` project. Migrations `0001_dataclass_foundation.sql` through `0007_lesson_resources.sql` were validated on isolated Neon branches before transactional production application. The `dataclass-step-3`, `dataclass-step-4`, `dataclass-step-5`, `dataclass-step-6`, and `dataclass-step-6b` branches remain available for rollback/reference.

## Delivery model

- Lessons take place physically in a classroom.
- The teacher records the classroom computer with OBS.
- Recordings will be uploaded to YouTube as Unlisted videos.
- DataClass stores video URLs and metadata only, never OBS video files in PostgreSQL.
- Lesson file resources use a private Backblaze B2 bucket. PostgreSQL stores metadata only; a Cloudflare Worker authorizes requests through Neon and signs short-lived B2 URLs.
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

Real Google authentication, secure profile bootstrap, multi-role loading, route protection, sign-out, class management, owner-controlled bulk invitations, authenticated invitation claiming, membership views, existing-teacher instructor assignment, module/lesson management, YouTube lesson recordings, and the private-resource database foundation are complete in production. Cloudflare Worker production deployment and production-origin B2 CORS remain intentionally deferred until DataClass has a real deployed origin. External invitation email delivery, assignments, and submissions remain intentionally unimplemented.

## Current status

- **Completed:** Step 1 — Foundation & UI Skeleton
- **Completed:** Step 2 — Neon Project + Database Foundation
- **Completed:** Step 3 — Authentication + Role System
- **Completed:** Step 4 — Class Management + Student Invitations
- **Completed:** Step 5 — Course Modules + Lessons
- **Completed at application/storage architecture level:** Step 6 — Lesson Resources + Video
- **Migration validation branch retained for review:** `dataclass-step-2`
- **Production status:** validated 15-table foundation, Neon-authenticated Data API, secure student bootstrap, own-profile/own-role RLS, multi-teacher architecture, class management, module/lesson security, YouTube recording metadata security, and Step 6B private-resource metadata/security applied; no application data seeded
- **Step 3 reference branch:** `dataclass-step-3` retained with development-only dual-role test data
- **Authentication architecture:** Google OAuth, secure default-student bootstrap, trusted teacher provisioning, multi-role routing, and sign-out complete
- **Multi-teacher architecture:** class owner/lead teacher, participating class instructors, and multiple module instructors supported
- **Step 4 validation:** two real Google identities completed teacher class creation, secure invitation, first-login bootstrap, automatic claim, active membership, student visibility, and teacher member-count verification on `dataclass-step-4`
- **Step 4 security model:** class creation derives the owner from Neon Auth, invitation claiming derives the student and email from Neon Auth, and instructor assignment requires an existing trusted teacher role
- **Authentication initialization:** React StrictMode remains enabled; concurrent initialization calls share one in-flight promise while preserving session → bootstrap → invitation claim → profile/roles → workspace ordering
- **Protected data initialization:** authenticated page loaders use a per-loader single-flight guard. React StrictMode duplicate effects share one request, and stale results from superseded route parameters cannot overwrite current page state.
- **Step 4 reference branch:** `dataclass-step-4` retained with development-only two-account test data
- **Step 5 architecture:** class owners manage all module content; assigned module instructors manage only their modules; students can read active/completed modules and published lessons only within their own classes
- **Step 5 development data:** four real development-only modules and two lessons were created under the existing Step 4 test class; this data must never be promoted to production
- **Step 5 browser validation:** the real student account sees all four authorized modules and published lessons, cannot see draft lessons, and can open the authorized module and lesson routes; unauthorized access remains denied
- **Step 5 production promotion:** `0005_modules_lessons.sql` was applied transactionally; production matches `dataclass-step-5` for Step 5 functions, policies, constraints, indexes, permissions, and RLS state while excluding all development data
- **Step 6A production promotion:** `0006_lesson_video.sql` was applied transactionally to production. Production matches `dataclass-step-6` for functions, grants, constraints, and RLS state while excluding all development identities, course content, and recording metadata.
- **Step 6A recording authorization:** authorized class owners and assigned module instructors can attach, replace, or remove normalized YouTube metadata without changing lesson status; authorized students receive only the derived video ID for published lessons.
- **Step 6A browser validation:** the real owner attached a YouTube recording and verified thumbnail, saved state, replace/remove controls, and the safe external link. The real student played the responsive embedded recording on the published lesson while the draft lesson remained hidden.
- **Step 6A recording model:** teachers upload OBS recordings manually to YouTube as Unlisted. DataClass stores canonical YouTube metadata only and builds student embeds from validated video IDs using `youtube-nocookie.com`; it never uploads, proxies, or fetches video content server-side.
- **YouTube privacy:** Unlisted videos are link-accessible and are not DRM or cryptographically private storage. DataClass limits metadata access through existing lesson authorization but cannot prevent an authorized viewer from sharing a YouTube link.
- **Step 6B development architecture:** teachers request an authorized upload intent from a local Cloudflare Worker, upload bytes directly to the private B2 bucket with a five-minute presigned PUT, and finalize only after the Worker verifies the exact object and size with `HeadObject`. Authorized downloads use two-minute presigned GET URLs. The browser never receives B2 credentials or chooses an object key.
- **Step 6B status:** migration `0007_lesson_resources.sql`, Worker signing endpoints, and teacher/student resource UI were validated on `dataclass-step-6b`. The migration is now applied to production with matching columns, constraints, indexes, functions, grants, policies, and RLS state and no application data. The private bucket retains an exact localhost-only PUT/GET/HEAD development CORS rule. Real teacher E2E validated authenticated upload intent, direct PUT, HeadObject finalization, ready metadata, and download authorization. Real student E2E validated published-lesson listing, temporary download, file integrity, absence of delete controls, and continued draft-lesson hiding. The destructive owner-delete path was verified through authorization/catalog inspection and B2 DeleteObject compatibility without deleting the retained E2E resource. The Worker has not been deployed; production Worker secrets, production origin, and production B2 CORS remain deferred to release preparation.
- **Resource limits:** V1 lesson resources are non-empty supported course files up to 500 MiB. Pending upload metadata is hidden from students and may require future abandoned-upload cleanup.
- **Known non-blocking issue for final QA / production readiness:** after a full local environment or computer restart, the first authenticated workspace initialization may occasionally show “Workspace setup needs attention.” Selecting “Try again” once immediately succeeds, after which authenticated navigation, refreshes, authorized class/module/lesson access, and published-only visibility remain stable for the session. This issue is **not fixed** and must be revisited during final QA / production readiness. The existing auth and protected-data single-flight guards remain in place; no arbitrary delay, security bypass, or weakened RLS workaround has been added.
- **Step 6 boundary:** video and private-resource application/storage architecture is complete, migrations through `0007` are in production, and `dataclass-step-6` plus `dataclass-step-6b` remain available for reference. Cloudflare Worker production deployment and exact production-origin CORS configuration remain deferred until deployment/release preparation.
- **Next major feature:** Assignments + Student Submissions. Step 7 has not started.
