# DataClass Project Context

## Product purpose

DataClass is a professional digital workspace for an in-person Data Analytics course. Teachers organize class groups, classroom lessons, course resources, assignments, submissions, reviews, and written feedback. Students follow the course structure, submit work, and review submission status and feedback.

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
- Backblaze B2 private object storage (lesson, assignment, and submission file bytes)

## Current architecture

The frontend is organized by reusable UI and layout components, role-specific teacher and student components, routed pages, typed domain data, services, hooks, shared utilities, assets, and global styles. `App.tsx` is limited to route composition. Class, module, lesson, assignment, and submission workflows use dedicated typed Neon service layers; later course features remain mock-free or clearly marked as unavailable.

Repository-managed SQL migrations live in `database/migrations`. The current database model is documented in `docs/DATABASE.md`. The workspace is linked to the existing Neon `DataClass` project. Migrations `0001_dataclass_foundation.sql` through `0009_module_lifecycle.sql` were validated on isolated Neon branches before transactional production application. The `dataclass-step-3`, `dataclass-step-4`, `dataclass-step-5`, `dataclass-step-6`, `dataclass-step-6b`, and `dataclass-step-7` branches remain available for rollback/reference.

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
- **Student:** joins invited classes, follows lessons, completes assignments, submits and resubmits files, and reviews submission status and feedback.
- A user may hold multiple application roles through `public.user_roles`.
- Teacher-role provisioning remains trusted/admin-controlled. Assigning a profile to `class_teachers` or `module_teachers` must validate that the profile already has the `teacher` application role; assignment never grants that role.

## Explicit exclusions

- Attendance is managed externally by the training center and is not part of DataClass.
- V1 has no numeric grades, scores, GPA, gradebook, or certificates.
- PostgreSQL stores no file or video binary data.

## Intentionally not implemented yet

Real Google authentication, secure profile bootstrap, multi-role loading, route protection, sign-out, class management, owner-controlled bulk invitations, authenticated invitation claiming, membership views, existing-teacher instructor assignment, module/lesson management, YouTube lesson recordings, lesson resources, assignments, versioned submissions, review states, and text feedback are complete at the application/database architecture level. Cloudflare Worker production deployment and production-origin B2 CORS remain intentionally deferred until DataClass has a real deployed origin. External invitation email delivery remains unimplemented.

## Current status

- **Completed:** Step 1 — Foundation & UI Skeleton
- **Completed:** Step 2 — Neon Project + Database Foundation
- **Completed:** Step 3 — Authentication + Role System
- **Completed:** Step 4 — Class Management + Student Invitations
- **Completed:** Step 5 — Course Modules + Lessons
- **Completed at application/storage architecture level:** Step 6 — Lesson Resources + Video
- **Completed:** Step 7 — Assignments + Student Submissions
- **Accepted for review:** Step 7B — Core Product QA + UX cleanup
- **Accepted for review:** Step 7C — Theme polish + guided UX
- **Completed:** Step 8 — Module Lifecycle + Learning Path
- **Completed:** Step 9.1 — Premium Visual Foundation
- **Completed:** Step 9.2 — Premium Submission Review
- **Completed:** Step 11 — Azerbaijani / English Localization
- **Completed:** Step 12 — Final Branding & Logo Integration
- **Completed:** Step 13.2 — Production Repository Preparation (deployment pending)
- **Migration validation branch retained for review:** `dataclass-step-2`
- **Production status:** validated 15-table foundation, Neon-authenticated Data API, secure student bootstrap, own-profile/own-role RLS, multi-teacher architecture, class management, module/lesson security, YouTube recording metadata security, private-resource metadata/security, Step 7 assignment/submission schema/security, corrected Step 8 module-lifecycle schema/security, and the authorized Step 9.2 student-avatar submission-detail contract applied; no application data seeded
- **Step 3 reference branch:** `dataclass-step-3` retained with development-only dual-role test data
- **Authentication architecture:** Google OAuth, secure default-student bootstrap, trusted teacher provisioning, multi-role routing, and sign-out complete
- **Multi-teacher architecture:** class owner/lead teacher, participating class instructors, and multiple module instructors supported
- **Step 4 validation:** two real Google identities completed teacher class creation, secure invitation, first-login bootstrap, automatic claim, active membership, student visibility, and teacher member-count verification on `dataclass-step-4`
- **Step 4 security model:** class creation derives the owner from Neon Auth, invitation claiming derives the student and email from Neon Auth, and instructor assignment requires an existing trusted teacher role
- **Authentication initialization:** React StrictMode remains enabled and concurrent initialization calls share one in-flight promise. Core workspace readiness requires a valid session/token, successful profile bootstrap, and valid roles. Invitation claiming is attempted deterministically after core readiness but no longer invalidates an otherwise valid authenticated workspace when it fails.
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
- **Step 10.1/10.2 authentication reliability:** the audit ruled out React StrictMode duplication, early workspace queries, and a deterministic bootstrap defect. A matching intermittent startup failure was later captured at the profile-bootstrap phase with PostgreSQL code `42501`, but the underlying authorization-context trigger—and specifically any Neon cold-start relationship—remains unconfirmed. Startup now retains a non-identity attempt label plus typed, sanitized phase/status and allowlisted `42501` classification; preserves a valid session/user when later core initialization fails; and treats invitation claiming as non-blocking to core authentication readiness. Step 10.2 is complete with the existing manual Try again recovery and no blind retry, delay, database/RPC/grant change, security bypass, or RLS change. The rare issue is non-blocking for a limited real-class launch and remains under observation.
- **Step 6 boundary:** video and private-resource application/storage architecture is complete, migrations through `0007` are in production, and `dataclass-step-6` plus `dataclass-step-6b` remain available for reference. Cloudflare Worker production deployment and exact production-origin CORS configuration remain deferred until deployment/release preparation.
- **Step 7 development architecture:** assignments support draft/published/closed/archived lifecycle, optional lesson linkage, server-enforced deadlines, and private assignment resources. Each student has one logical submission per assignment; file versions preserve resubmission history through submitted/late/revision-requested/resubmitted/reviewed states. Teacher feedback is text-only and no numeric grading exists.
- **Step 7 security boundary:** class owners manage class-level or lesson-linked assignments; assigned module instructors manage only lesson-linked assignments in their modules. Students see published assignments for their active memberships and only their own submission/files/feedback. Current identity and object paths are always derived by authenticated database functions.
- **Step 7 validation and production promotion:** migration `0008_assignments_submissions.sql` was validated on `dataclass-step-7` through the definitive two-account workflow: draft creation, private task file, publication, student submission, teacher feedback/revision request, version 2 resubmission, preservation/download of both versions, teacher review, and final student `Reviewed` state. The migration was then applied transactionally to production with matching functions, grants, constraints, indexes, policies, and RLS state and with zero application data.
- **Step 7 storage and review model:** assignment resources and submission files reuse the private B2/Worker signing architecture. One logical submission is retained per assignment/student, immutable file versions preserve revision history, deadlines use database time, and review is text feedback plus `revision_requested`/`reviewed` status only. Numeric grading remains excluded.
- **Step 7B QA cleanup:** teacher and student dashboards now use only factual class, assignment, enrollment, and submission data with direct next actions. Residual Step 1 mock datasets/components, the fake notification affordance, and non-functional class actions were removed. Navigation entries without real destinations (`Students`, `Reviews`, and `Progress`) are temporarily hidden until their underlying product capabilities exist. Assignment status, timestamp, loading, retry, and safe authorization messages were normalized; dialog and focus semantics were improved; route pages are lazy-loaded to reduce the initial bundle.
- **Step 7B database boundary:** no schema defect was found, no migration was created, and production remained unchanged. The Cloudflare Worker remains undeployed and its production-origin configuration remains deferred.
- **Step 7C guided UX:** Light Mode now uses distinct warm page, card, sidebar, and header surfaces with stronger restrained borders/elevation while Dark Mode retains its existing tokens. Teacher setup guidance derives completion from existing classes, enrollments, modules/lessons, published assignments, and reviewed submissions, and disappears once the core sequence is complete. Student guidance prioritizes new assignments and revision feedback. A role-specific, database-free Help panel and concise form/empty-state guidance were added.
- **Step 7C boundary:** no schema change, onboarding persistence, or feature expansion was introduced. Production and the undeployed Worker remain untouched.
- **Step 7D Excel course content:** the Excel teaching phase is complete. Fourteen real published Excel lesson recordings were imported on `dataclass-step-7` from direct YouTube playlist enumeration of `PLakI4NBcQ7nk`; lesson files and resources will be uploaded manually. Legacy E2E resources remain preserved on an archived test lesson, no separate Excel instructor is required, and SQL or Power BI is expected to become the next active course module.
- **Step 8 production architecture:** corrected migration `0009_module_lifecycle.sql` preserves legacy `modules.status` as module availability/archive state (`draft`, `active`, `completed`, `archived`) and independently adds `modules.lifecycle_status` for course-level Upcoming / Active / Completed teaching progression. Archived and draft modules remain hidden regardless of lifecycle, and an archived module cannot be lifecycle Active. A partial unique index allows at most one Active teaching lifecycle per class, and only the authenticated class owner can change lifecycle through a locked-down RPC. Completed teaching modules remain accessible when availability permits. Lifecycle is not per-student completion and adds no watched state or progress percentage.
- **Step 8 real development state:** Excel is Completed; SQL, Power BI, and Python are Upcoming. No module is currently Active because the next teaching module has not been confirmed. These are development-only rows and were not copied to production.
- **Step 9.1 visual foundation:** Lumina/Stitch was used only as a visual reference while existing DataClass functionality, routes, services, and real data remained the product source of truth. The authenticated workspace now uses Hanken Grotesk headings, Inter UI text, unified warm-light and premium-dark tokens, a refined shell/navigation system, responsive real-data dashboards and assignment views, lifecycle learning-path styling, contextual Help, shared status treatments, and harmonized forms and empty states. Desktop manual visual QA passed. Physical mobile-device QA remains a non-blocking follow-up for the navigation drawer, dashboards, learning path, assignments, dialogs, Help, and upload/download interactions; code-level 360px validation passed.
- **Step 9.2 submission review:** the teacher review route now uses a responsive premium split view with real student context, version-grouped files, secure temporary downloads, preserved plain-text feedback and review actions, and an honest download-first state instead of a fabricated inline preview. It adds no grades, annotations, or preview service. The student's existing `profiles.avatar_url` is returned only through the already-authorized `get_submission_detail()` contract; restrictive profile RLS remains unchanged and initials remain the missing/broken-image fallback. Migration `0010_submission_student_avatar.sql` is in production with no application data seeded.
- **Step 11 localization:** the frontend uses bundled, synchronous `i18next` / `react-i18next` resources with Azerbaijani as the default and English as the secondary language. The browser-local `dataclass-language` preference is resolved before React renders, synchronizes `document.documentElement.lang`, and stays independent of authentication initialization. System UI, centralized enum/status labels, locale-aware dates, validation, accessibility text, Help, and teacher/student workflows are localized; user-entered course content, names, feedback, and filenames are never auto-translated. There is no database language preference, migration, backend contract change, or production change. Manual bilingual visual QA passed; physical mobile-device QA remains deferred.
- **Step 12 branding:** the official DataClass horizontal logo and compact DC/book/data mark are integrated as separate transparent Light/Dark raster assets without changing the established forest/sage product palette or translating the DataClass name. Manual visual QA passed for Light/Dark login, expanded teacher navigation, and the collapsed mark. No clean vector master currently exists. A custom favicon is intentionally deferred until a designer-approved simplified mark is available, and physical-device mobile branding QA remains a non-blocking follow-up.
- **Step 13.2 production repository preparation:** the initial launch will use the free Vercel `.vercel.app` production hostname. Vite SPA rewrites and Node 24.x are prepared, production browser endpoints now fail safely when missing, invalid, non-HTTPS, or local, and a distinct Wrangler production environment declares only required secret names while origin-dependent normal variables remain intentionally incomplete. No frontend, Worker, OAuth, B2, or production deployment occurred.
- **Next feature boundary:** the exact Vercel hostname must be obtained in Step 13.3 before configuring Neon Auth/Google OAuth origins, Worker `APP_ORIGIN`, production Worker deployment, or B2 CORS. Physical mobile-device QA remains a non-blocking follow-up.
