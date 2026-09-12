# Production Auth Gateway Cutover Runbook

This runbook is the executable production procedure for the DataClass auth gateway cutover. It does not authorize a cutover. Run it only in an approved maintenance window, with a named operator and reviewer, from an approved `main` commit. Do not use the frozen Lesson 1 XLSX incident as a smoke fixture.

## Frozen inputs

- Feature source reviewed in Step 16.5A: `22b17ace666e75db12a346f89e03da2e83b7443d`.
- Production baseline reviewed in Step 16.5A: `b32cd6b5a38410380b1ae312cb218526e02dd82d`.
- SQL artifact: `database/staging/auth_gateway_identity_v1.sql`.
- SQL SHA-256: `AE5295E081E542AA7C820AE875687712BB6D7FAE39577922D54CE9FEACE66A01`.
- Frontend origin: `https://dataclass-two.vercel.app`.
- Worker origin: `https://dataclass-resource-signer-production.dataclass-two.workers.dev`.
- Production B2 bucket: `dataclass-resources`; preserve the bucket and all existing objects.

Before starting, checkpoint the feature changes, obtain approval to merge, merge by the repository's reviewed strategy, and record the exact resulting `main` commit. Deploy only that commit. Record the current production Worker version, frontend deployment, Worker variables/secrets/bindings, and Vercel environment values as rollback material. Do not tag a release until the final gate passes.

## Restore point and prechecks

Production Neon currently retains six hours of history. Immediately before SQL execution, stop application writes or enter the approved maintenance state, record an exact UTC timestamp and `SELECT pg_current_wal_lsn()`, and verify that the timestamp is inside the active history window. If the plan owner authorizes a named Neon snapshot, create it now and record its name; otherwise the timestamp/LSN is the restore reference. The rollback operator must already have permission to restore the production branch.

Run every database precheck through a direct, unpooled owner connection in an explicit read-only transaction with a statement timeout. Confirm the resolved endpoint belongs to the production branch before querying.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

SELECT current_database(), current_user, pg_current_wal_lsn(), clock_timestamp();

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_function_result(p.oid), p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2, 3;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;

SELECT rolname FROM pg_roles
WHERE rolname IN ('dataclass_gateway', 'dataclass_gateway_owner');

SELECT nspname FROM pg_namespace
WHERE nspname IN ('app_private', 'app_gateway');

ROLLBACK;
```

Compare the exported function signatures with `tests/fixtures/auth-gateway-db-manifest.json`. The expected pre-migration application inventory is 84 functions, including 71 callable operations, nine legacy policies, and seven triggers. The legacy layer has 76 functions and three policies with direct `auth.uid()`/`auth.user_id()` references; six more policies depend on identity helpers. `app_private`, `app_gateway`, and both gateway roles must be absent unless an earlier authorized attempt created them.

Also confirm the frozen incident still has exactly two pending Lesson 1 XLSX metadata rows, two corresponding B2 objects in the incident inventory, and zero finalized Lesson 1 resources. Do not read, mutate, or smoke-test those objects. Confirm ordinary production row counts are plausible and record them for postcheck comparison.

The migration revokes `TEMP` on the database from `PUBLIC`. Before applying it, confirm no non-gateway application or operational role depends on implicit temporary-table access. Grant any justified role explicitly through a separately reviewed action; do not weaken the gateway role.

Any material mismatch is `STOP`: do not apply SQL. Reconcile the drift and review a new artifact.

## Apply SQL

1. Recompute the SQL SHA-256 and require an exact match with the frozen value above.
2. Use the direct, unpooled production owner connection. Do not use Hyperdrive or a browser credential.
3. Enable client-side stop-on-error and capture sanitized command status without echoing connection strings or future passwords.
4. Execute the artifact exactly once. It is one transaction from `BEGIN` through `COMMIT`; role changes, schemas, functions, policies, grants, and revokes are transactional PostgreSQL DDL.
5. Do not add a password to the checked-in SQL. The artifact intentionally creates `dataclass_gateway` as a LOGIN without a password and `dataclass_gateway_owner` as NOLOGIN.

If execution fails before commit, require transaction rollback, save the sanitized error and `STOP`. Do not rerun until the database inventory proves that no partial state exists. If commit succeeds, proceed immediately to postchecks while writes remain stopped.

## Post-SQL validation pack

Run the following through the owner connection in a read-only transaction and retain sanitized results with the release record.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- Expected: app_gateway 71, app_private 13, total 84.
SELECT n.nspname, count(*)::integer AS functions
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('app_private', 'app_gateway')
GROUP BY n.nspname ORDER BY n.nspname;

-- Expected: one actor helper with the reviewed UUID result.
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_function_result(p.oid), p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app_private' AND p.proname = 'current_actor_id';

-- Expected: zero active migrated identity references.
SELECT count(*)::integer AS forbidden_identity_refs
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('app_private', 'app_gateway')
  AND pg_get_functiondef(p.oid) ~ 'auth\.(uid|user_id)\s*\(';

-- The nine audited legacy policies remain for the legacy surface.
SELECT count(*)::integer AS legacy_policy_count
FROM pg_policies
WHERE schemaname = 'public' AND policyname NOT LIKE 'app_gateway_capability_%';

-- Expected: 15 nonrecursive capability policies, one per protected table.
SELECT count(*)::integer AS capability_policy_count
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'app_gateway_capability_%';

-- Expected: seven triggers.
SELECT count(*)::integer AS trigger_count
FROM information_schema.triggers WHERE event_object_schema = 'public';

-- Expected hardened role attributes: LOGIN only for dataclass_gateway;
-- neither role is superuser, create-role, create-db, replication, or bypass-RLS.
SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb,
       rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('dataclass_gateway', 'dataclass_gateway_owner')
ORDER BY rolname;

-- Expected: LOGIN has no application-table privileges and is not a member of
-- the capability role.
SELECT count(*)::integer AS direct_table_privileges
FROM information_schema.role_table_grants
WHERE grantee = 'dataclass_gateway';

SELECT pg_has_role('dataclass_gateway', 'dataclass_gateway_owner', 'MEMBER')
       AS gateway_is_capability_member;

ROLLBACK;
```

Run the repository's manifest/registry and database-manifest tests against a read-only production connection. Require exact public signature parity, 71 callable registry entries, 55 browser operations, 16 Worker-internal operations, no duplicate overload mapping, and browser rejection of every internal key. Audit `SECURITY DEFINER` ownership and fixed search paths. Confirm the capability owner owns no application table and the LOGIN cannot select from tables, create objects, assume the owner, invoke unlisted functions, or set an actor except through the reviewed transaction-local helper. Recheck seven triggers, precheck data counts, and the frozen `2 pending / 0 ready` incident state.

Any failed postcheck is `STOP`. Do not provision or route application traffic. If the failure is material after commit, use the recorded Neon restore point rather than improvising a reverse migration.

## Gateway credential and Hyperdrive

The SQL role model is fixed:

- `dataclass_gateway`: restricted `NOINHERIT` LOGIN used only by Hyperdrive.
- `dataclass_gateway_owner`: `NOLOGIN`, `NOINHERIT` capability owner for the migrated functions.

After SQL postchecks pass, generate a high-entropy password using the approved password manager or secret system. Do not print it, put it in shell history, pass it on a process command line, write it to a tracked file, or expose it to the browser. Set it through a secure interactive or parameterized owner session and place it only in the production Hyperdrive origin configuration.

Create production Hyperdrive against the production branch and database with `dataclass_gateway`, TLS verification, and binding name `HYPERDRIVE`. Validate a request-scoped `pg.Client` connection, `session_user`, transaction-local actor set/clear, timeouts, rollback, and disposal. The application must not use `pg.Pool` or reuse a client across requests.

Credential rotation means set a new strong password through the secure channel, update Hyperdrive, validate, and invalidate the old value. Emergency revocation means stop gateway traffic and set the LOGIN to `NOLOGIN` or rotate its password. Rollback detaches or restores the saved Worker binding and leaves the capability owner inaccessible. Never expose this credential to Vercel or a `VITE_*` variable.

## Worker and B2

Configure the production Worker from the approved merged `main` commit with:

- binding: `HYPERDRIVE`.
- variables: `APP_ORIGIN`, `GATEWAY_ENABLED=true`, `GATEWAY_APP_ORIGIN`, `GATEWAY_NEON_JWT_ISSUER`, `GATEWAY_NEON_JWT_AUDIENCE`, `GATEWAY_NEON_JWKS_URL`, `B2_BUCKET_NAME`, `B2_S3_ENDPOINT`, and `B2_REGION`.
- secrets: `B2_KEY_ID` and `B2_APPLICATION_KEY`.

Both origin variables must equal the exact production frontend origin. Issuer and audience must equal the production Auth origin. The fixed HTTPS JWKS URL must be the production Auth JWKS endpoint. The route remains the existing production Worker origin.

Before deployment, verify or replace the production B2 application key with one restricted exclusively to `dataclass-resources` and the capabilities `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles`. Native API `b2_list_file_names` inspection requires `listFiles` and a bucket-restricted authorization. Preserve the private bucket, S3 endpoint, region, signed direct PUT/GET design, existing objects, and production CORS. No storage migration is needed.

Keep the legacy `NEON_DATA_API_URL` binding through the initial Worker deployment and smoke. It has no source consumer and is not a fallback. After gateway and storage smoke pass, remove the binding in a separately reviewed configuration change, redeploy the same source, and repeat smoke. Keep both prior Worker versions and binding snapshots until completion.

## Auth preflight

Immediately before enabling traffic, sign in through the normal production Neon Auth SDK flow. In memory only, call the supported `neonClient.auth.getSession()` path and inspect the transformed `data.session.token`. Verify EdDSA, the configured issuer and audience, UUID `sub`, `exp`, optional `nbf`, and signature against the fixed configured JWKS. Reject token-controlled `jku`/`x5u`. Do not use raw `/get-session`, the unsupported public `getJWTToken()` diagnostic path, logs, clipboard, or persistent files.

## Frontend

Do not deploy the new frontend until the production Worker passes its gateway/auth/storage smoke. Preserve the existing production Neon Auth configuration. Set:

- `VITE_RPC_GATEWAY_URL=https://dataclass-resource-signer-production.dataclass-two.workers.dev`
- `VITE_STORAGE_API_URL=https://dataclass-resource-signer-production.dataclass-two.workers.dev`

Build the approved merged `main` commit, verify the generated bundle contains no Data API application transport, deploy to a preview, run login/read smoke, then promote it to production. Record the previous production deployment and environment snapshot so rollback can promote the prior artifact without a runtime fallback.

## Exact cutover sequence

0. Announce the approved maintenance window, name operator/reviewer, and stop writes.
1. Verify current production health, approved `main` commit, saved Worker/frontend versions, and saved configuration snapshots.
2. Record the Neon UTC timestamp and WAL LSN; verify the six-hour restore window and any approved snapshot.
3. Run final database, B2-key capability, Auth, and configuration prechecks.
4. Verify the SQL checksum and apply the approved migration once.
5. Run the complete SQL postcheck pack and manifest parity tests.
6. Securely provision and validate the restricted gateway credential.
7. Create and validate production Hyperdrive with that credential.
8. Configure production Worker variables, secrets, and `HYPERDRIVE`; retain the legacy binding.
9. Deploy the new Worker from the approved merged `main` commit.
10. Run Worker gateway, Auth, internal-key denial, and storage smoke.
11. Set the frontend gateway and storage Worker URLs.
12. Build, preview-smoke, deploy, and promote the frontend.
13. Run separate teacher and student login/read smoke.
14. Run the new disposable production storage smoke below.
15. Verify frontend and Worker Data API traffic are both zero and review sanitized errors/1101 status.
16. Remove only the legacy Worker Data API binding and redeploy the same source.
17. Repeat Worker, frontend, Auth, read, and storage-route smoke.
18. Restore normal traffic, retain rollback material through the restore window, and declare completion.

## Production smoke matrix

Use normal SDK login for an authorized owner/teacher and a separate student. Verify correct roles, no 42501, no duplicate bootstrap/claim, the existing Data Analytics class, existing Excel content, and student class visibility. Do not modify existing course content.

If a write is required, create one clearly named disposable production test class with synthetic data, verify it once, and remove it through supported application behavior. For storage, create one new tiny disposable resource unrelated to Lesson 1: prepare, direct signed B2 PUT, Native API inspection, finalize, list, teacher/student download as appropriate, B2 delete, and metadata delete. Confirm the Worker never proxies bytes, no transaction spans B2, and no Data API request occurs. Reconcile uncertain M3/M4 outcomes before any retry; never replay automatically.

## Deterministic failure actions

| Cut point | Action |
|---|---|
| SQL apply fails before commit | `STOP`; verify rollback and unchanged inventory. Do not rerun until reviewed. |
| SQL postcheck fails after commit | `STOP`; keep traffic stopped and restore the production branch to the recorded timestamp/LSN if the failure is material. Re-run baseline checks. |
| Credential or Hyperdrive validation fails | `STOP`; revoke/rotate the new LOGIN credential, remove the unused Hyperdrive configuration, and leave existing deployments unchanged. |
| Worker deployment fails | `ROLLBACK` to the recorded Worker version and binding set; smoke the restored Worker before continuing service. |
| Worker Auth smoke fails | `ROLLBACK` Worker; keep the old frontend; disable gateway traffic and inspect issuer/audience/JWKS without printing tokens. |
| Worker storage smoke fails | `STOP`; reconcile the disposable object/metadata, then roll back Worker and its binding set. Do not deploy frontend. |
| Frontend deployment fails | `ROLLBACK` by promoting the recorded frontend deployment and restoring its environment snapshot; optionally leave the unused gateway Worker dormant. |
| Frontend login/read smoke fails | `ROLLBACK` frontend first, then Worker if the previous frontend depends on the previous Worker contract. Verify legacy health. |
| Disposable storage smoke fails | `STOP`; identify object/metadata state, reconcile once, and roll back frontend/Worker. Do not touch the frozen incident. |
| Legacy binding removal smoke fails | `ROLLBACK` to the saved Worker configuration/version containing the binding, then smoke. The new source still must not use it as fallback. |

`CONTINUE` only when the current stage's stated validation is green and the reviewer records the result. An uncertain mutation is always `STOP` and reconcile, never retry.

## Rollback

The last safe rollback point is immediately before SQL application. Canceling there requires no production change.

After SQL commit, first stop new traffic and reconcile any uncertain M3/M4 request. Before the six-hour history window expires, restore the production Neon branch to the recorded timestamp or LSN using Neon's branch restore operation, preserving the displaced branch under an incident name when supported. Wait for the restore operation, reconnect clients, and run the full pre-migration baseline checks. The restore can discard writes made after the restore point, so the maintenance window must prevent or account for those writes.

Promote the recorded prior frontend deployment, restore its environment snapshot, deploy the recorded prior Worker version with its saved binding set, and verify the legacy service. Revoke the gateway LOGIN, detach the new Hyperdrive binding, and retain their identifiers for incident review. Do not invent or edit a reverse migration during an incident.

There is no designed irreversible application step while the database restore window and prior deployment/configuration artifacts remain available. Once Neon history expires, prior artifacts are deleted, or post-cutover writes cannot be reconciled, point-in-time rollback may no longer be safe; use a reviewed forward repair. A longer commercial restore window should be established before broad commercial use.

## Deferred frozen XLSX reconciliation

This is a separate approval after cutover is healthy:

1. Confirm the new Auth and storage path is healthy and the cutover rollback window is stable.
2. Identify the exact two frozen pending Lesson 1 XLSX rows from the incident inventory.
3. Identify their exact two production B2 objects without using them as smoke fixtures.
4. Verify neither row/object is finalized, referenced, or changed since the freeze.
5. Remove stale metadata and objects in the reviewed storage-safe order, stopping on ambiguity.
6. Verify Lesson 1 has zero stale resources and no unexpected object remains.
7. Upload one new real Lesson 1 XLSX through the supported UI.
8. Require Native API inspection and successful finalize.
9. Verify teacher download.
10. Verify student download and exactly one correct finalized resource.

## Capacity and final success criteria

No code-level blocker is evident for 10 or more classes with multiple teachers/students and Excel, SQL, Power BI, Python, YouTube video, and B2 files. Before commercial use, move Vercel off the non-commercial Hobby plan. Monitor Cloudflare Worker CPU/request quotas, Hyperdrive statement volume, Neon compute/storage and restore retention, and B2 storage/egress; upgrade the relevant paid tier before limits become operational constraints. A Neon tier with a longer restore window is recommended for commercial recovery.

Cutover succeeds only when SQL and role checks pass, the fixed JWT contract passes, Hyperdrive uses the restricted role, Worker and frontend are the recorded `main` commit, 55/16 exposure remains intact, Auth/read/storage smoke passes, direct B2 bytes are proven, Data API runtime is zero after legacy-binding removal, no 1101 or sensitive error leakage appears, rollback material is retained, and the frozen XLSX incident remains untouched.
