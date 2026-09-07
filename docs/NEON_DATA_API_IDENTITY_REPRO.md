# Neon support: intermittent PostgreSQL identity loss through Data API

Prepared 2026-09-07. Sanitized incident report; no new production reproduction was performed for this report. Historical observations come from the existing incident record and the application owner's confirmed findings. SDK behavior was independently audited against installed and release-tagged source. No bearer values, cookies, personal identifiers, endpoint/project identifiers, or credentials are included.

## Investigation requested

Investigate Data API/PostgREST JWT claims propagation into PostgreSQL request identity context on the production branch. Independent valid authenticated requests have reached PostgreSQL with the authenticated role, but `auth.uid()` intermittently returns NULL and RPCs fail with SQLSTATE `42501`. The extension helper exists and is valid. Subsequent requests can succeed without application or configuration changes.

This identifies the failing boundary, not a confirmed internal Neon mechanism. Neon-side traces are unavailable. Please distinguish PostgREST claims setup, Neon proxy context, connection reuse, and extension initialization when investigating.

## Production stack

| Component | Version / evidence |
| --- | --- |
| Neon Auth and Data API/PostgREST | Managed production services; server build versions not captured |
| PostgreSQL | Managed Neon; engine version absent from the sanitized incident record |
| `pg_session_jwt` | 0.5.0, previously confirmed on production |
| `@neondatabase/neon-js` | 0.7.0-beta |
| `@neondatabase/auth` | 0.5.0-beta |
| `@neondatabase/postgrest-js` | 0.2.0-beta |
| `better-auth` | 1.6.23, resolving nested core 1.6.23 |
| React / Vite | 19.2.8 / 8.2.1, resolved application lockfile |
| Frontend | Production HTTPS application on Vercel |
| Storage backend | Cloudflare Worker; Wrangler 4.123.0; configured compatibility date 2026-08-16 with nodejs_compat |
| Object storage | Backblaze B2 S3 API; credentials Worker-only |

Client versions describe the audited production application dependency set, not a new deployment inspection. No server version is inferred from OpenAPI metadata.

## Correct JWT acquisition

DataClass uses standard Neon client construction with derived endpoints and the default Better Auth vanilla adapter. The external-request helper uses:

```text
getCurrentNeonAuthToken()
  -> neonClient.auth.getSession()
  -> SDK-transformed/cached data.session.token
  -> Bearer authorization to Worker
```

Normal `neonClient.rpc(...)` uses `fetchWithToken` and a private accessor calling the internal adapter's `getJWTToken(false)`. That method calls the same Better Auth `getSession()` and extracts the same field. The SDK response hook reads `set-auth-jwt`, replaces the raw session token with that JWT, and caches the transformed session. The current application token helper is correct and is not being changed.

A direct fetch of raw `/get-session` JSON bypasses that transformation. Its opaque `session.token` is not the Data API JWT. Earlier invalid-JWT-encoding rejection of that raw credential was a separate diagnostic error and is excluded from this incident.

Public `neonClient.auth.getJWTToken()` is unsupported for this adapter. Better Auth's proxy interprets the unknown method as `/get-jwt-token`, resulting in 404. The private method is not exposed there. Previously inspected production OpenAPI listed `/get-session`, `/token`, and `/.well-known/jwks.json`, but not `/get-jwt-token`. That diagnostic misuse is not an application defect and is also excluded.

## Historical production evidence

The prior investigation confirmed valid authenticated JWTs, matching issuer/audience, an acceptable subject, and requests reaching PostgreSQL in the authenticated role. Sensitive values are intentionally omitted. No raw verification transcript, request timestamps, correlation identifiers, or measured failure rate is available in this sanitized report; none is invented.

The authenticated database role does not establish application teacher/student permissions. Those remain database-derived through existing membership, ownership, and role checks. Expected behavior is for the verified subject to reach `auth.uid()` so these checks execute for the correct caller.

| Path | Recorded failure | Impact |
| --- | --- | --- |
| Browser -> Data API -> `bootstrap_current_user()` | Identity guard sees NULL; SQLSTATE `42501`, `Authentication is required` | Application bootstrap fails |
| Browser -> storage Worker -> Data API -> read-only resource authorization RPC | Valid bearer forwarded unchanged; database identity unavailable; SQLSTATE `42501` | Storage authorization fails before object deletion |

Sanitized browser response:

```json
{
  "code": "42501",
  "message": "Authentication is required",
  "details": null,
  "hint": null
}
```

The repository bootstrap function raises this specific error when `auth.uid()` is NULL, before its writes. This interpretation does not mean every `42501` indicates missing identity.

For the Worker incident, the underlying resource, teacher relationship, and B2 object were independently confirmed to exist. B2 deletion was not reached because read-only database authorization failed first. The current Worker checks bearer shape and forwards it; it does not independently verify the signature, refresh the JWT, or alter it. Neon validates the token on this existing path. No exact Worker error message beyond the recorded SQLSTATE is fabricated here.

## Confirmed exclusions

For the documented requests, the prior investigation excluded missing/expired/malformed bearer credentials, incorrect issuer/audience or malformed subject, wrong branch or endpoints, OAuth callback handling, browser CORS, missing function EXECUTE privilege, and ordinary RLS denial as explanations for the NULL identity guard. Authorization remains enabled and fails closed. These are incident-specific exclusions, not assertions about all possible errors.

Neon package versions match published requirements. Separate Better Auth UI peer conflicts exist: an API-key plugin at 1.6.29 requires a newer Better Auth peer than 1.6.23; root core 1.6.29 expects better-call 1.4.0 while root resolves 1.3.7. Better Auth itself resolves nested core 1.6.23. These warnings do not explain the unsupported diagnostic route, and are not evidence of the PostgreSQL identity-loss mechanism. No package upgrade is claimed to fix this incident.

## Current resilience and limitations

- Bootstrap already retries once after 300 ms only for the exact authentication-required error, following session revalidation. Bootstrap is not generally read-only; the qualifying guard fails before writes. This does not authorize arbitrary mutation replay.
- Worker logic retries once after 300 ms only for HTTP 403 plus SQLSTATE `42501` on an explicit allowlist of read-only authorization/state RPCs, with the unchanged bearer. This predicate may also match an actual permission denial; it does not independently prove NULL identity.
- Prepare, finalize, metadata-delete, and other business mutations are not covered by the Worker retry. No additional retries are proposed. Existing resilience is not a root fix or availability guarantee.

Identity loss can block application mutations and storage workflows. B2 actions and later database metadata changes are separate operations, not one atomic transaction. Failures between stages can leave pending or inconsistent state; blindly replaying mutations is unsafe.

Two pending Lesson 1 XLSX rows and two B2 objects are intentionally frozen. They must not be deleted, finalized, replaced, or cleaned up while the platform/root strategy is undecided.

## Reproduction context and questions

This report describes already observed production paths, not instructions to rerun them. The trigger is an ordinary authenticated RPC from the browser or Worker. Failure is intermittent, and subsequent success without changes has been observed. No deterministic timing trigger or failure frequency is claimed. Please use Neon-side evidence for the production branch and propose any further reproduction in an isolated environment first.

Is this a known `pg_session_jwt` 0.5.0 / Data API issue? Is a backend/project-side remediation or upgrade available? Which identity mode does this production Data API use, and can its context become stale or absent across connection/request boundaries? Please provide root-resolution and validation guidance without replaying production mutations.

## Exact support message — prepared, not sent

Subject: Intermittent auth.uid() NULL for valid authenticated Data API requests

Please investigate Data API/PostgREST JWT claims propagation into PostgreSQL request identity context for our production branch. With pg_session_jwt 0.5.0 and neon-js 0.7.0-beta, independent valid authenticated requests from both browser -> Data API and Worker -> Data API have reached PostgreSQL in the authenticated role, but auth.uid() intermittently returns NULL and RPCs raise SQLSTATE 42501. Subsequent requests can succeed without changes. Our SDK getSession() helper correctly obtains the transformed/cached JWT; raw session-token and unsupported getJWTToken() diagnostic errors are excluded. Existing bounded resilience does not make mutating operations reliable, and production diagnostics are frozen. Is this a known pg_session_jwt/Data API issue? Is a backend/project-side remediation or upgrade available? Please review the attached sanitized report and advise a root resolution without replaying production mutations.

## Sources

- [Neon client factory at release 0.7.0-beta](https://github.com/neondatabase/neon-js/blob/54ee34260de8672761225201f4b93e8937868f38/packages/neon-js/src/client/client-factory.ts)
- [Matching auth adapter implementation](https://github.com/neondatabase/neon-js/blob/54ee34260de8672761225201f4b93e8937868f38/packages/auth/src/core/adapter-core.ts)
- [Neon JWT documentation](https://neon.com/docs/auth/guides/plugins/jwt)
- [pg_session_jwt 0.5.0 source](https://github.com/neondatabase/pg_session_jwt/blob/v0.5.0/src/lib.rs)
