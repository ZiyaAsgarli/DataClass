# Production Rollback Runbook

**APPROVED APPLICATION ROLLBACK BASELINE:** `fa5ccfa4860dd02dd65fd5a71416f87b3bf880e3`

This is the last fully QA-approved production application commit before the documentation-only release checkpoint. Returning to this commit can restore the approved application code, but it does not resolve the external Neon platform identity incident.

## Frontend

Redeploy the previously approved production commit through the existing Vercel workflow. Verify that the deployment is `Ready`, matches the intended commit, and passes safe read-only route, authentication, localization, theme, Help, and 404 smoke tests.

## Cloudflare Worker

Roll back the Worker only when a Worker change caused the incident. Deploy the previous approved Worker version while preserving the established production variables and secrets. Recheck exact-origin CORS behavior and unauthenticated rejection. Do not roll back the Worker merely because a Neon identity-context failure occurred.

## Database

Do not perform a blind or destructive rollback. Prefer an independently reviewed forward corrective migration. Any production database correction requires explicit manual approval, a verified backup/recovery plan, and validation against current data and authorization behavior.

## Storage

Never delete a B2 object merely to make it appear consistent with a failed database mutation. Establish the exact metadata and object state first, choose a reviewed reconciliation action, and then update both sides deliberately. Preserve the frozen Lesson 1 XLSX rows and objects until the Neon/root-strategy decision and cleanup approval.

## Known Neon incident

Application, frontend, Worker, or database rollback does not resolve the external Neon request-identity issue. When a valid authenticated request reaches PostgreSQL without `auth.uid()`, stop authorization-critical mutations and follow the support/fallback decision recorded in the incident documentation.
