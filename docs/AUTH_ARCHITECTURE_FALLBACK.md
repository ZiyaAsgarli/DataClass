# DataClass authorization fallback — design only

Prepared 2026-09-07. No implementation, SQL migration, configuration change, deployment, or production testing is authorized by this document. Token helpers and existing retries remain unchanged. The two pending Lesson 1 XLSX rows and two B2 objects remain untouched.

## Recommendation

**WAIT FOR NEON.** A platform remediation is the least invasive root resolution. The fallback is feasible, but changes the authorization boundary and requires isolated security/behavior validation before production use.

If Neon cannot provide an acceptable remediation, use an allowlisted Cloudflare Worker RPC gateway, server-side Neon Auth JWT verification, and direct PostgreSQL calls under a restricted backend login. For complete independence, introduce an application-owned transaction identity helper and replace `auth.uid()` references in the latest RPC/helper/policy definitions. Preserve RPC names, arguments, result shapes, business rules, and frontend service interfaces. Do not replace the extension-owned `auth.uid()` function.

```text
Browser: existing Neon Auth and unchanged token helper
  -> existing services -> shared RPC transport
  -> Cloudflare Worker: verify JWT; select allowlisted operation
  -> direct PostgreSQL transaction: establish verified actor
  -> existing teacher/student authorization logic and applicable RLS
```

This complete fallback removes PostgREST and pg_session_jwt from the authorization-critical identity path. Neon Auth and Neon Postgres remain. The trusted backend becomes an identity attestation boundary without receiving unrestricted table access.

## Preservation and repository findings

The migration files contain 84 distinct public function names, including internal helpers and trigger functions. This is not a count of exposed RPCs. Some functions are redefined by later migrations; use only final definitions and reconcile grants/signatures before implementation. No production catalog query was performed for this design.

Five frontend files directly call `neonClient.rpc`; no direct `neonClient.from` calls were found in src:

- `src/services/classService.ts`
- `src/services/moduleService.ts`
- `src/services/assignmentService.ts`
- `src/services/storageService.ts`
- `src/context/AuthContext.tsx`

Four services already wrap RPC calls. AuthContext calls bootstrap and invitation claim. Replace these transport seams with a shared adapter while retaining service methods, result mapping, auth lifecycle, and current bootstrap resilience.

**Existing RPCs preservable: YES at contract and business-logic level, not necessarily byte-for-byte SQL.** Full independence requires identity accessor and applicable policy-role changes. Existing ownership, class/module teacher, membership, submission ownership, and other predicates stay in SQL. Browser-supplied target-user/resource arguments remain authorization-checked targets, never caller identity. Review every exposed operation for its guard or RLS path; internal helpers and trigger functions are not gateway endpoints.

## Options A, B, and C

| Option | Assessment | Decision |
| --- | --- | --- |
| A: Worker verifies JWT and establishes PostgreSQL claims context | Can preserve existing SQL, subject to connection-mode validation; bypasses PostgREST but retains claims-GUC/extension dependency | Conditional bridge, not complete independence |
| B: Direct PostgreSQL with pg_session_jwt JWK mode | Exact 0.5.0 source imposes token-format and connection-state constraints | Not proven compatible; requires Neon confirmation |
| C: Generic allowlisted RPC gateway | Fits existing transport seams; gateway alone does not fix database identity | Recommend with direct DB and independent actor helper |

### A — explicitly verified claims bridge

Verify the original Neon JWT in the Worker, derive claims only from verified values, and parameterize `set_config('request.jwt.claims', ..., true)` inside the same transaction and checked-out connection as the RPC. Fail closed if database identity does not match the verified subject. Browser input cannot supply claims or select a database role.

The extension reads that GUC only when no JWK is configured. With a JWK present it uses its JWT path instead. A future isolated validation must establish the connection's actual mode; setting claims alone does not prove this project will work. Do not change production initialization to force that mode.

GUCs are mutable database parameters, not verified credentials. This bridge depends on backend-only credentials, no arbitrary SQL, restricted grants, and no exposed function capable of changing context. It removes the PostgREST propagation step, but cannot eliminate extension dependence. [Extension modes and security warning](https://github.com/neondatabase/pg_session_jwt).

### B — exact 0.5.0 limitations

The tagged source establishes that `pg_session_jwt.jwk` is a backend-startup setting, with a cached verification key. `auth.init()` initializes a single Ed25519 key; `auth.jwt_session_init()` sets session-level JWT state. Validation requires a numeric `jti`, and increasing values when switching to different tokens on one connection. Compatibility with current Neon Auth tokens is not established; the official documented payload does not guarantee that field.

The verifier does not enforce issuer/audience. Its cached-identical-token path also skips renewed validation. Worker signature, issuer, audience, and time validation remain mandatory. Do not invent, alter, or re-sign tokens to satisfy the extension. Do not accept token-supplied key URLs. Ask Neon about supported token format, startup settings, key rotation, and supported connection semantics.

A direct non-pooled connection per operation would simplify a future proof but does not resolve token-format incompatibility. Hyperdrive's general session-state limitations also prevent assuming JWK initialization/cache/reset compatibility. No claim is made that normal Neon Auth tokens can simply be passed to `auth.jwt_session_init()` successfully.

Sources: [0.5.0 verifier](https://github.com/neondatabase/pg_session_jwt/blob/v0.5.0/src/lib.rs), [0.5.0 GUC settings](https://github.com/neondatabase/pg_session_jwt/blob/v0.5.0/src/gucs.rs), [Hyperdrive supported features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/).

### C — complete fallback design

Use a static Worker registry mapping approved operation names to fixed schema-qualified SQL, parameter types, argument validation, and return metadata. Reject unknown keys and names; bind values and explicitly cast arguments. Browser strings never become SQL identifiers, schema names, roles, or SQL fragments. No arbitrary query/filter endpoint is introduced.

Separate browser-callable operations from backend-only storage primitives. In particular, finalize and metadata-delete operations must remain behind existing Worker orchestration and object checks; adding every database RPC to a public gateway would weaken the current boundary. Preserve scalar, set-returning, void, null, bigint, timestamp, and structured-error behavior deliberately. Raw node-postgres rows do not automatically reproduce all PostgREST return shapes.

Introduce a schema-qualified helper such as `app_private.current_actor_id()`. It reads a transaction-local actor only when SQL `session_user` equals the dedicated backend login; otherwise it returns NULL. Missing/malformed identity fails closed. Use `session_user` rather than `current_user`, since SECURITY DEFINER functions change the latter. An ordinary Data API session must not be able to impersonate a caller merely by setting the same custom GUC. Unauthorized roles cannot create/replace the helper, alter its schema, or change grants; fix its search_path. Expose no context setters through the registry.

The actor comes exclusively from the server-verified subject. The Worker uses parameterized `set_config(..., true)` inside an explicit transaction, checks the helper returns the expected actor, then invokes the approved RPC on the same connection. Commit/rollback ends local context. Error/cancellation paths roll back and dispose of unusable connections. Never split context initialization and execution into unrelated pooled/autocommit requests. [PostgreSQL SET LOCAL semantics](https://www.postgresql.org/docs/current/sql-set.html).

This trusted context no longer depends on `request.jwt.claims`, PostgREST, or `auth.uid()`. It is not tamper-proof against the trusted backend login: stolen credentials or SQL injection remain critical. The static registry, least privilege, no browser SQL access, and login-gated helper are required controls.

## Security model and migration

Verify the Neon Auth signature using an explicit allowed algorithm and fixed configured issuer, audience, and HTTPS JWKS URL. Require valid subject and expiration, enforce issuer/audience and applicable not-before values, and reject anonymous access. Cache public keys with bounded refresh/rotation; unknown keys or failed verification fail closed. Never derive network destinations from untrusted issuer/jku input. Never log JWTs or decoded personal data. Teacher/student permissions remain database-derived. This design does not promise instant session revocation beyond token expiry; define any stronger revocation requirement separately. [Neon JWT documentation](https://neon.com/docs/auth/guides/plugins/jwt).

Provision a dedicated LOGIN without superuser, BYPASSRLS, table/schema ownership, role administration, general DDL rights, or membership in privileged owner roles. Grant only reviewed function execution/schema usage and narrowly necessary policy-protected access. Never use database-owner credentials or allow SET SESSION AUTHORIZATION to another identity. Adapt policy role targets for the restricted backend execution role while preserving predicates.

Existing SECURITY DEFINER functions execute with owner privileges; table owners can bypass RLS. Preserve their explicit caller checks and fixed search paths, and audit their owners/grants. Do not claim those functions become RLS-enforced merely by moving transport. Keep existing table RLS and validate invoker/definer behavior separately. Do not blindly enable FORCE RLS or replace guarded RPCs with service-role table access. [PostgreSQL RLS semantics](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**DB migration required: YES.** Add one new forward migration for the restricted role/helper, latest identity-dependent function definitions, policy references/role targets, and minimal grants. Retain business logic and RPC signatures; revoke unintended PUBLIC execution. Do not edit historical migrations or extension-owned functions. Reconcile final definitions before authoring migration, including helper/policy references. This design contains no executable migration.

After accessor migration, old Data API clients fail closed. Plan a coordinated frontend/Worker/SQL cutover with maintenance/reload handling for old browser builds. Do not silently fall back to the problematic identity path. A rollback must restore prior definitions/grants coherently; it does not resolve the original platform incident.

## Cloudflare and B2

For C, use node-postgres through Hyperdrive with nodejs_compat and a request-scoped client. Disable query-result caching for identity-sensitive traffic. Keep context and RPC in one explicit transaction and prove cross-user isolation before rollout. Direct TLS node-postgres with bounded concurrency and deterministic close is the alternate transport if Hyperdrive compatibility is unsuitable. [Cloudflare PostgreSQL integration](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/).

DB credentials belong only in Worker secrets or Hyperdrive bindings, never browser/VITE configuration. B2 credentials remain Worker-only. Existing signed upload/download interfaces and object-check ordering remain. Replace the implementation behind `callNeonRpc` so storage routes need minimal change. Preserve existing retry bounds without expanding eligibility or introducing mutation retries. Never replay an ambiguous commit through either transport.

Do not hold database transactions across B2 calls. The fallback does not make object operations and database metadata atomic; reconciliation/idempotency is a separate future design. Pending production XLSX rows/objects are not migration fixtures and are never cleaned up by rollout or rollback.

## Estimated affected files and scope

| Area | Estimate if separately approved |
| --- | --- |
| Frontend | Five existing files listed above plus new `src/lib/rpc.ts`: 6 total. `src/lib/neon.ts` and token helper unchanged. |
| Worker | Modify `worker/index.ts`, `worker/lib/neonAuth.ts`, `worker/lib/responses.ts`, `worker/types.ts`, generated `worker/worker-configuration.d.ts`; add `worker/lib/verifyNeonJwt.ts`, `worker/lib/database.ts`, `worker/lib/rpcRegistry.ts`: about 8 files. |
| SQL | One new forward migration, affecting many function/policy/grant objects; no business-RPC rewrite intended. |
| Dependencies/config | `package.json`, `package-lock.json`, `wrangler.jsonc`; declare pg/jose as direct dependencies and provision restricted credentials/bindings only after approval. |
| Validation/docs | Approximately 3–5 focused auth/gateway/database test files and deployment/storage documentation updates. Existing retry tests retained/adapted. |

**MEDIUM implementation scope; HIGH authorization regression consequence.** Planning estimate: 5–10 engineering days including isolated security/behavior validation, conditional on provisioning and platform access. Exact object counts and timing require later final-definition/catalog reconciliation. The shared transport is small; authorization migration and contract validation dominate effort.

## Future validation and decision gates

1. Obtain Neon's response and separate implementation approval. Use an isolated branch, synthetic users, and separate test storage only.
2. Inventory final signatures, owners, grants, RLS predicates, dynamic SQL, and context-changing functions. Keep internal and backend-only storage operations out of the browser registry.
3. Verify rejection of wrong signature/issuer/audience, expiry, missing/anonymous JWT, untrusted actor fields, unknown RPCs, argument injection, and cross-class/teacher/student access. Test key rotation and missing identity.
4. Prove context isolation under concurrent alternating users, commit/rollback, timeout, cancellation, reconnect, and pool reuse; check identity inside SECURITY DEFINER calls and RLS policies.
5. Compare return/error contracts for every exposed RPC and existing storage route. Exercise mutations only in isolation, without new retries or dual writes.
6. Plan coordinated cutover and coherent rollback. No production mutation is a diagnostic probe; no automatic transport fallback after an ambiguous write.

No gate has been executed. **WAIT FOR NEON** now; if remediation is unavailable, authorize a separate isolated fallback implementation. Do not resume request-by-request production debugging.
