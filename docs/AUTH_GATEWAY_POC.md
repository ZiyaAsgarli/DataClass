# Isolated Auth Gateway Proof of Concept

Prepared on the isolated `dataclass-step-16-auth-gateway` branch. This PoC was not deployed or applied to any database. The production frontend, Data API path, storage Worker, Neon project, database, B2 state, and frozen Lesson 1 XLSX incident remain unchanged.

## Audit findings

The installed client stack is `@neondatabase/neon-js` 0.7.0-beta with `@neondatabase/auth` 0.5.0-beta, Better Auth 1.6.23, and a standards-based `jose` implementation. The current frontend obtains its JWT through the unchanged transformed/cached `getSession()` path. The existing storage Worker only forwards that bearer to the Data API and has no direct PostgreSQL transport.

The authoritative issuer is the exact HTTPS Neon Auth base URL for the branch, including its database/auth path. Prior sanitized production validation confirmed that the JWT audience matches that same base URL and that `sub` is the UUID used by `neon_auth.user.id` and `public.profiles.id`. The PoC requires issuer and audience as fixed server-side configuration; it never derives either from token claims.

The current Auth deployment exposes JWKS at the fixed issuer-relative path `/.well-known/jwks.json`. A sanitized capability check returned HTTP 200, one public OKP key, and EdDSA. The adapter-style `/jwt`, generic `/jwks`, and issuer-relative OpenID discovery candidates returned 404. The PoC therefore derives the HTTPS JWKS URL from the configured issuer plus the confirmed fixed path. It ignores `jku`, `x5u`, and all other token-provided network locations.

Cloudflare documents node-postgres as its recommended PostgreSQL driver and Hyperdrive as the preferred connection path. Direct Worker TCP/TLS is technically available without Hyperdrive, and the already-installed Neon serverless driver can also run interactive WebSocket transactions, but neither is selected for this PoC. The selected transport is node-postgres through a dedicated Hyperdrive binding because it provides the supported Worker connection path while retaining a checked-out connection for `BEGIN` through `COMMIT`. Identity-sensitive query caching must be disabled on that binding. The repository currently has no Hyperdrive configuration or Worker-side database credential/binding. Local developer database environment names exist, but they are not a Worker credential mechanism and are not reused by this design.

References: [Cloudflare PostgreSQL and Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), [Hyperdrive transaction-local SET behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/), [Neon serverless driver transactions](https://neon.com/docs/serverless/serverless-driver), and [Better Auth JWT validation defaults](https://better-auth.com/docs/plugins/jwt).

## Dependencies

- `jose` 6.2.12 is a direct runtime dependency because the PoC imports its maintained Web Crypto JWT/JWKS verifier. The older copy remains nested for the pinned Neon Auth package.
- `pg` 8.23.0 is a direct runtime dependency because the PoC imports node-postgres for the selected Hyperdrive transport. It meets Cloudflare's documented minimum.
- `@types/pg` 8.23.1 is a development-only dependency for strict Worker type checking.

Both runtime packages were already present transitively, but direct imports require direct dependency declarations. No frontend import uses them, and the production bundle output is unchanged.

## Selected operation

The registry contains exactly one operation key: `list_my_student_classes`.

This operation is parameter-free, read-only, stable, returns a small deterministic list, and already represents membership-based student authorization. The isolated `app_poc.list_my_student_classes()` fixture preserves the current result columns and query semantics while replacing only its caller-identity lookup with `app_private.current_actor_id()`. It does not call or modify the production function.

## JWT verification contract

`worker/poc/verifyNeonJwt.ts` uses `jose` with these fail-closed rules:

- EdDSA is the only accepted algorithm; `none` and other algorithms are rejected.
- Signature keys come only from the fixed HTTPS issuer-relative JWKS URL.
- Issuer and audience must exactly match fixed server configuration.
- `iss`, `aud`, `sub`, and `exp` are required.
- Expiration is enforced; `nbf` is enforced when present.
- `sub` must be a non-empty RFC 4122 UUID compatible with DataClass identity columns.
- Remote JWKS retrieval has a five-second timeout, a 30-second refresh cooldown, and a ten-minute cache maximum for bounded rotation behavior.
- Raw tokens and decoded claims are never logged.

The user token is verified as received. It is not re-signed, rewritten, or transformed.

## Gateway and database transaction

The PoC endpoint is `POST /internal-poc/rpc` in a separate `worker/poc` entrypoint. The production Worker entrypoint and Wrangler production configuration do not reference it. Its isolated Wrangler template uses a different Worker name, contains no Hyperdrive identifier, uses invalid placeholder origins, and explicitly disables the gateway. The endpoint returns 404 unless `POC_AUTH_GATEWAY_ENABLED` is exactly `true`, requires an exact configured application origin, caps JSON input at 4 KiB, and accepts only this shape:

```json
{
  "operation": "list_my_student_classes",
  "params": {}
}
```

Extra fields, actor/user identity, parameters, unknown operations, and SQL-like operation strings are rejected. Browser input never becomes an SQL identifier or SQL fragment.

The database executor uses one checked-out client for the entire sequence:

1. `BEGIN`
2. Parameterized transaction-local `set_config('app.verified_actor_id', verified_sub, true)`
3. Assert `app_private.current_actor_id()` equals the verified subject
4. Execute the registry-owned fixed SQL for the one operation
5. `COMMIT`
6. Assert the actor helper returns null outside the transaction
7. Close/discard the client

An error before commit causes `ROLLBACK`; a rollback failure cannot replace the original error and the connection is still discarded. There is no Data API fallback.

## Application-owned actor helper

The isolated SQL fixture creates `app_private.current_actor_id()` with a fixed `pg_catalog` search path. It reads only transaction-local `app.verified_actor_id`, and only when `session_user` is the dedicated gateway login. Missing, empty, malformed, wrong-login, committed, or rolled-back context returns null. No context setter function or arbitrary `SET` endpoint is exposed. The fixture neither replaces nor modifies extension-owned `auth.uid()`.

## Restricted role design

The fixture separates two roles:

- `dataclass_gateway_poc` is the restricted LOGIN used by the Worker. It has no superuser, BYPASSRLS, database/schema ownership, role administration, database creation, DDL, public-table SELECT, or public-function execution. It receives only database connection, schema usage for the two PoC schemas, and execute rights for the actor assertion and one PoC function.
- `dataclass_gateway_poc_owner` is a NOLOGIN capability/function owner. It owns only the two PoC schemas/functions and receives SELECT only on `classes`, `class_members`, and `profiles`, which the selected operation requires. Three isolated PoC SELECT policies allow this NOLOGIN owner to evaluate the fixed function; the function itself applies the verified membership predicate and is the only data capability exposed to the LOGIN.

The isolated database must revoke public temporary-database privileges plus public-schema usage/creation and default public-function execution as included in the fixture, while retaining the existing direct grants for application roles. The fixture asserts that the gateway login cannot use/create in `public`, create temporary tables, or select `public.classes` directly. A credential is created and stored only through the isolated backend/Hyperdrive setup; no password or connection value exists in this repository.

## Test matrix

| Test | Result |
| --- | --- |
| A. Valid user A JWT resolves actor A and A result | PASS |
| B. Valid user B JWT resolves actor B and B result | PASS |
| C. A then B on a reused client does not leak A | PASS |
| D. B then A on a reused client does not leak B | PASS |
| E. Invalid signature rejected before database | PASS |
| F. Expired JWT rejected | PASS |
| G. Wrong issuer rejected | PASS |
| H. Wrong audience rejected | PASS |
| I. Missing subject rejected | PASS |
| J. Browser-supplied `user_id` rejected before database | PASS |
| K. Unknown operation rejected | PASS |
| L. SQL-like operation/argument input cannot reach a query identifier | PASS |
| M. Rollback clears actor before the next user | PASS |

Additional coverage proves `alg=none` rejection, token-provided key URL rejection, transaction-local context assertion, post-commit clearing, exact fixed SQL, and a disabled endpoint returning 404 before authentication or database work.

## Live PoC status

`LIVE_POC_BLOCKED_BY_ISOLATED_INFRA`

The repository is linked to Neon and local developer connection names exist, but the audit found no clearly named/verified isolated PoC branch, no Hyperdrive binding, no restricted PoC roles/helper/function, no provisioned isolated PoC Worker environment, and no confirmed synthetic Auth users for two-identity validation. Production cannot substitute for these resources.

The required isolated resources are:

1. A dedicated Neon development branch/database containing synthetic-only DataClass rows
2. Two synthetic Neon Auth users on that isolated branch
3. The SQL fixture applied only to that isolated database
4. A dedicated Hyperdrive configuration pointing only to the restricted PoC login, with query caching disabled
5. A separate non-production Worker configuration for the `worker/poc` entrypoint with fixed issuer, audience, exact origin, and enabled flag

## Security review

- Arbitrary SQL/function invocation: impossible through the static one-entry registry.
- Actor source: verified JWT subject only; browser actor fields are rejected.
- JWT behavior: fixed key source and claims contract; failures stop before database execution.
- Database secret boundary: future Hyperdrive/Worker-only configuration; no frontend value.
- Cross-user state: transaction-local, asserted before operation and after commit, cleared on rollback, and tested in alternating order on a reused client.
- Database role: dedicated least-privilege LOGIN plus a narrow NOLOGIN function owner.
- Production exposure: absent because the production Worker entrypoint/config is unchanged and the separate PoC entrypoint defaults unavailable without explicit isolated bindings and enablement.

## Exact next migration step

Before Step 16.2 changes any application path, provision and approve the five isolated resources above, apply this fixture only there, and execute one live read-only two-user proof. Compare the gateway result contract with the existing Data API response. If that proof passes, convert the reviewed actor/role design into a new forward migration, inventory final identity-dependent helpers/RPCs/policies, and plan a coordinated transport cutover. Do not edit historical migrations, expose the PoC endpoint in production, or change existing frontend RPC callers during this PoC.
