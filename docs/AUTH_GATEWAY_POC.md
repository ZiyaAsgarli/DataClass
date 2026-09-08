# Isolated Auth Gateway Proof of Concept

Prepared on the isolated `dataclass-step-16-auth-gateway` branch. Step 16.2 created a separate, clean Neon project, enabled branch-local Neon Auth there, applied the PoC fixture to that database, created a dedicated cache-disabled Hyperdrive configuration, and deployed the separate PoC Worker to its own `workers.dev` hostname. No production route, data, credential, binding, application, Worker, database, B2 state, or frozen Lesson 1 XLSX row or object was used or changed.

## Audit findings

The installed client stack is `@neondatabase/neon-js` 0.7.0-beta with `@neondatabase/auth` 0.5.0-beta, Better Auth 1.6.23, and a standards-based `jose` implementation. The current frontend obtains its JWT through the unchanged transformed/cached `getSession()` path. The existing storage Worker only forwards that bearer to the Data API and has no direct PostgreSQL transport.

The live isolated token contract differs from the original Step 16.1 assumption. The authoritative issuer and audience are both the exact HTTPS origin of the branch Auth service. `NEON_AUTH_BASE_URL` additionally contains the database/Auth API path and is not the issuer. The JWT `sub` is the UUID stored for the synthetic Auth user and used by the synthetic `public.profiles.id`. The PoC requires issuer and audience as fixed server-side configuration; it never derives either from token claims.

The isolated Auth deployment exposes JWKS below the database/Auth API base path at `/.well-known/jwks.json`, on the same HTTPS origin as the issuer. Because this is not issuer-relative, the Worker now requires the exact trusted JWKS URL as separate server-side configuration. Live tokens use EdDSA, require `iss`, `aud`, `sub`, and `exp`, and did not include `nbf`; `nbf` remains enforced when supplied. The verifier ignores `jku`, `x5u`, and all other token-provided network locations.

Cloudflare documents node-postgres as its recommended PostgreSQL driver and Hyperdrive as the preferred connection path. The live PoC uses node-postgres through a dedicated Hyperdrive binding and retains one client for `BEGIN` through `COMMIT`. Query caching is disabled on that binding. Hyperdrive contains only the restricted isolated database credential. The repository template contains no live Hyperdrive identifier or credential; live configuration remains outside the repository.

References: [Cloudflare PostgreSQL and Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), [Hyperdrive transaction-local SET behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/), [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/), [Neon branchable Auth](https://neon.com/blog/handling-auth-in-a-staging-environment), and [Better Auth JWT validation defaults](https://better-auth.com/docs/plugins/jwt).

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
- Signature keys come only from a separate fixed HTTPS JWKS URL on the trusted Auth origin.
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

The database executor creates one new `pg.Client` inside each Worker request and uses that same request-scoped client for the entire sequence. There is no application `pg.Pool` and no module-global client; Hyperdrive owns infrastructure-level pooling. The executor applies a Worker-owned 12-second response deadline:

1. `BEGIN`
2. Set transaction-local statement and idle-transaction timeouts
3. Parameterized transaction-local `set_config('app.verified_actor_id', verified_sub, true)`
4. Assert `app_private.current_actor_id()` equals the verified subject
5. Execute the registry-owned fixed SQL for the one operation
6. `COMMIT`
7. Assert the actor helper returns null outside the transaction
8. Close a successfully connected, still-usable client

An error after `BEGIN` and before a confirmed commit causes one `ROLLBACK`; a failure before `BEGIN` does not. Rollback and cleanup failures cannot replace the original error. A failed connect or asynchronously broken socket is left to node-postgres' connection-error path instead of issuing a second close. There is no Data API fallback and no transaction retry.

The complete fetch path has a final response boundary. Database connection, query, transaction, rollback, cleanup, and timeout failures normalize to HTTP 503 JSON with the stable `GATEWAY_DATABASE_UNAVAILABLE` code and a generic message. PostgreSQL text, SQL, host, port, database, credentials, stack traces, and infrastructure identifiers are never returned or logged.

### Hyperdrive failure-boundary hardening

The pre-hardening deadline used `Promise.race`, but its timer called `client.end()` before rejecting the deadline promise. During concurrent failed Hyperdrive origin handshakes, `pg-cloudflare` could synchronously enter its writer/close path before the socket writer existed. That throw occurred before `reject()`, so the deadline promise remained unresolved. Cloudflare's exception tail classified the five escaped requests as “the script will never generate a response,” and the edge returned Error 1101 HTML. This was application lifecycle handling, not cross-request identity reuse or a PostgreSQL authorization failure.

The hardened deadline first marks the request expired and rejects with the normalized database error. It never manipulates an in-flight socket. The database lifecycle promise has its own complete catch/finally handling; if a delayed connection eventually resolves, it observes the expired flag before starting a transaction and safely disposes that connected client. Transaction-local PostgreSQL statement and idle-transaction timeouts remain in force after `BEGIN`.

A request-scoped node-postgres `error` listener marks an asynchronously broken connected client unusable and prevents an unhandled EventEmitter exception. It does not retry, start cleanup work, expose error detail, or make the client reusable. This matches Cloudflare's current guidance to construct a new `Client` per request using only the Hyperdrive connection string while Hyperdrive maintains the underlying pool.

## Application-owned actor helper

The isolated SQL fixture creates `app_private.current_actor_id()` with a fixed `pg_catalog` search path. It reads only transaction-local `app.verified_actor_id`, and only when `session_user` is the dedicated gateway login. Missing, empty, malformed, wrong-login, committed, or rolled-back context returns null. No context setter function or arbitrary `SET` endpoint is exposed. The fixture neither replaces nor modifies extension-owned `auth.uid()`.

## Restricted role design

The fixture separates two roles:

- `dataclass_gateway_poc` is the restricted LOGIN used by the Worker. It has no superuser, BYPASSRLS, database/schema ownership, role administration, database creation, DDL, public-table SELECT, or public-function execution. It receives only database connection, schema usage for the two PoC schemas, and execute rights for the actor assertion and one PoC function.
- `dataclass_gateway_poc_owner` is a NOLOGIN capability/function owner. It owns only the two PoC schemas/functions and receives SELECT only on `classes`, `class_members`, and `profiles`, which the selected operation requires. Three isolated PoC SELECT policies allow this NOLOGIN owner to evaluate the fixed function; the function itself applies the verified membership predicate and is the only data capability exposed to the LOGIN.

The clean fixture creates only synthetic `profiles`, `classes`, and `class_members` tables. RLS is enabled and forced on all three. Public temporary-database privileges, public-schema usage/creation, public table access, and public function execution are revoked. The fixture and live probes confirm that the gateway login cannot select the tables, create regular or temporary objects, assume the capability role, or alter the actor helper. No password or connection value exists in this repository.

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

Additional coverage proves `alg=none` rejection, token-provided key URL rejection, transaction-local context assertion, post-commit clearing, exact fixed SQL, result normalization, and a disabled endpoint returning 404 before authentication or database work. Failure injection covers connect, `BEGIN`, actor setup, operation query, `COMMIT`, rollback, disposal, asynchronous pg error events, concurrent connection failures, stalled connections, recovery for users A and B, and alternating failure/success isolation.

## Live isolated proof

The identity architecture is live-proven on real isolated infrastructure:

- The Neon project was created clean rather than branched from production. It contains exactly two synthetic Auth users, four synthetic profiles, two synthetic classes, and two distinct memberships. It contains no production application rows.
- The actual restricted roles, schema/function owners, fixed search paths, RLS flags, policies, grants, and revocations match the design.
- User A receives only the A fixture and User B receives only the B fixture.
- The sequence A, B, A, B, B, A and twelve simultaneous alternating A/B requests produced zero cross-user results.
- Actor context is null outside the transaction and after both commit and forced rollback. A forced SQL failure returned sanitized JSON and the next A/B sequence remained isolated.
- Missing, malformed, tampered-signature, expired, wrong-issuer, and wrong-audience JWT cases were rejected. Wrong issuer and audience were tested independently by temporarily changing only the PoC Worker's fixed expectation, then restoring it.
- Fake browser identity, unknown operation, arbitrary function, and SQL-like operation inputs were rejected by the one-entry registry.
- Result field names, nullability, ISO timestamp serialization, and empty arrays match the existing RPC contract. Node-postgres returns `bigint` as text, so the registry normalizes the bounded `student_count` to a safe JSON number.
- A 15-second synthetic query was canceled by the transaction-local ten-second statement timeout. Normal requests succeeded after restoration.
- Before hardening, concurrent invalid-credential/origin failures produced one sanitized response and five Cloudflare 1101 HTML responses. Cloudflare exception events identified unresolved response promises caused by the deadline's premature socket close.
- After hardening, the same bounded six-request live failure test returned six HTTP 503 `application/json` responses with the exact sanitized gateway error, no 1101 response, no detail leakage, and no retry. Healthy A/B requests, alternating and concurrent identity isolation, commit/rollback clearing, JWT rejections, allowlist rejections, privilege probes, and result compatibility all passed again after the database credential was restored.

## Security review

- Arbitrary SQL/function invocation: impossible through the static one-entry registry.
- Actor source: verified JWT subject only; browser actor fields are rejected.
- JWT behavior: fixed key source and claims contract; failures stop before database execution.
- Database secret boundary: isolated Hyperdrive/Worker-only configuration; no frontend value.
- Cross-user state: transaction-local, asserted before operation and after commit, cleared on rollback, and tested in alternating order on a reused client.
- Database role: dedicated least-privilege LOGIN plus a narrow NOLOGIN function owner.
- Production exposure: absent. The live Worker uses only its separate `workers.dev` hostname, an exact synthetic test origin, a separate Hyperdrive binding, and no B2 binding or production domain route. The repository template still defaults disabled.

## Exact next migration step

**Final recommendation: SAFE TO PROCEED TO STAGED FULL IDENTITY MIGRATION.**

The identity and failure-boundary architecture is live-proven enough to begin the isolated Step 16.3 migration inventory. Step 16.3 should inventory every identity-dependent helper/RPC/policy, classify read and mutation semantics, define per-operation result normalization, and expand the allowlist incrementally in the retained isolated environment. Production rollout still requires a forward-only database migration, production token-contract verification, least-privilege grants for each operation, concurrency/load limits, observability codes, and coordinated frontend transport changes. Historical migrations, production Data API callers, production Worker routes, and storage must remain unchanged until that plan is approved.
