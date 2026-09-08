# V1.0 Release Checklist

Status values describe the current release candidate. `BLOCKED` items must be resolved before tagging or public release.

## Code

- [x] Test suite passes
- [x] Lint passes
- [x] Production build passes
- [x] `git diff --check` passes
- [ ] Working tree is clean after approved release-documentation commit

## Frontend

- [x] Vercel production deployment is Ready
- [x] Canonical URL is [dataclass-two.vercel.app](https://dataclass-two.vercel.app)
- [x] Public, teacher, student, nested-route, refresh, and navigation smoke tests pass
- [x] Azerbaijani and English interfaces pass
- [x] Light and dark themes pass
- [x] Desktop, laptop, tablet, mobile, and small-mobile layouts pass
- [x] Unknown routes render the branded 404 page

## Authentication

- [x] Google login works
- [x] Teacher role and teacher workspace work
- [x] Student role and student workspace work
- [x] Teacher/student navigation and action separation passes

## Content

- [x] Data Analytics production class is present
- [x] Excel, SQL, Power BI, and Python modules are present in the expected lifecycle states
- [x] Excel has exactly 14 ordered, published lessons
- [x] All 14 Excel lessons have YouTube recordings

## Storage

- [x] The storage Worker is deployed for the production integration
- [x] B2 remains private and production CORS is restricted to the application origin
- [x] The architecture uses short-lived signed upload and download URLs
- [ ] **BLOCKED BY NEON:** final real Lesson 1 resource upload/finalize/download validation
- [ ] **BLOCKED BY NEON:** final assignment-resource production validation
- [ ] **BLOCKED BY NEON:** final student-submission production validation
- [ ] **BLOCKED BY NEON:** final teacher-download production validation
- [ ] **BLOCKED BY NEON:** delete/finalize consistency validation and frozen-state reconciliation

Do not repeat or replay storage mutations while the Neon identity issue is open.

## Security

- [x] No application secret is present in frontend source or the frontend bundle
- [x] B2 credentials remain Worker-only
- [x] The B2 bucket is private
- [x] Production CORS does not use a wildcard origin
- [x] No PostgreSQL credential is exposed to the browser

## Release

- [x] Current production commit is approved
- [x] Production feature branch and `main` are at parity
- [ ] Release documentation changes are reviewed and committed
- [x] Approved application rollback baseline is recorded in the rollback runbook
- [ ] V1.0 release tag is created
- [ ] GitHub release is created
- [ ] Final public release approval is recorded
