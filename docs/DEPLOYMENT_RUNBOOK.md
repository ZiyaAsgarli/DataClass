# Production Deployment Runbook

This runbook applies to approved DataClass production changes. It does not authorize data mutation, secret disclosure, storage cleanup, or database debugging.

## Frontend

1. Start from the exact approved commit and verify the intended diff.
2. Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
3. Push the approved feature branch.
4. Fast-forward `main` to the exact same commit; do not merge unrelated changes.
5. Push `origin/main` and confirm local and remote branch parity.
6. Allow Vercel's automatic production deployment to run without changing project configuration.
7. Wait for Vercel to report `Ready` for the exact commit.
8. Perform safe read-only smoke checks: landing/login, role dashboard, representative class/module/lesson, localization, theme, Help, direct nested-route refresh, and branded 404.

The canonical production URL is [dataclass-two.vercel.app](https://dataclass-two.vercel.app).

## Cloudflare Worker

Deploy the Worker only when its source or production configuration intentionally changed and the change is approved.

1. Confirm the Worker diff and generated binding types.
2. Run the Worker type check and relevant tests.
3. Confirm that existing production variables and secrets remain present without printing their values.
4. Verify that `APP_ORIGIN` is the exact HTTPS production origin.
5. Deploy the approved Worker version.
6. Verify a protected route rejects an unauthenticated request without exposing internals.
7. Confirm browser file bytes still travel directly to/from B2 through signed URLs; the Worker must remain an authorization/signing path rather than a file-byte proxy.

## Database

1. Review each migration against the current production schema and authorization model.
2. Validate the migration in an isolated branch/environment before production.
3. Use a new forward-only migration; never edit a historical migration already applied to production.
4. Apply only the approved migration and verify expected schema, grants, functions, and policies.
5. Do not use ad-hoc production mutations as diagnostics.

## Storage architecture

The browser uploads to and downloads from private B2 through short-lived signed URLs. The Worker authenticates the request, asks the database to authorize and derive the object path, signs B2 access, and orchestrates metadata lifecycle operations. It does not proxy normal file bodies.

## Stop conditions

Stop the deployment when any of these conditions applies:

- The diff contains an unapproved file or dependency change.
- Tests, lint, build, Worker check, or `git diff --check` fails.
- The feature branch, `main`, deployed commit, or intended rollback point cannot be matched exactly.
- Required environment names are absent or an origin is broader than intended.
- Vercel does not reach `Ready`, or the safe route/auth smoke test fails.
- A migration is destructive, rewrites history, or has not been validated.
- A storage mutation returns an uncertain result or database/object state diverges.
- The known Neon identity-context symptom appears during an authorization-critical operation.

Record the failure without printing credentials or tokens. Do not compensate with retries, unapproved mutation, configuration changes, or object deletion.
