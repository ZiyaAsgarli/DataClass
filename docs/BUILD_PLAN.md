# DataClass Build Plan

1. Step 1 — Foundation & UI Skeleton
2. Step 2 — Neon Project + Database Foundation — **Complete**
3. Step 3 — Authentication + Role System — **Complete**
4. Step 4 — Class Management + Student Invitations — **Complete**
5. Step 5 — Course Modules + Lessons — **Complete**
6. Step 6 — Lesson Resources + Video
7. Step 7 — Assignment System
8. Step 8 — Student Submission System
9. Step 9 — Teacher Review + Feedback
10. Step 10 — Notifications + Activity
11. Step 11 — Analytics + Progress
12. Step 12 — Security/RLS Audit
13. Step 13 — Responsive QA + UX Polish
14. Step 14 — Production Deployment

Steps 1 through 5 are complete in production. Step 3 delivered Neon Managed Auth with Google OAuth, secure default-student bootstrap, trusted teacher provisioning, multi-role routing, and the multi-teacher class/module architecture. Step 4 delivered real class management, owner-controlled bulk invitations, authenticated automatic invitation claiming, student membership views, participating-instructor management, two-real-account E2E validation, and the React StrictMode single-flight authentication initialization fix. Step 5 provides real ordered modules, scoped module-instructor assignment, ordered classroom lessons, publishing, and published-only student views. Its authenticated page loaders share one in-flight request across StrictMode duplicate effects and ignore stale results after loader changes. Real-student browser validation confirmed authorized module/lesson access, published-only lesson visibility, and denial of unauthorized content. Migration `0005_modules_lessons.sql` is present in production with matching functions, policies, constraints, indexes, permissions, and RLS state; no development data was promoted.

Known non-blocking issue deferred to final QA / production readiness: after a full local environment or computer restart, the first authenticated workspace initialization may occasionally show “Workspace setup needs attention.” One manual “Try again” succeeds and subsequent authenticated navigation remains stable for that session. This is not considered fixed in Step 5; no delay, security bypass, or RLS workaround has been introduced. The next planned step is Step 6 — Lesson Resources + Video; it has not started.
