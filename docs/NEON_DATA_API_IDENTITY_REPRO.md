# Neon Data API identity propagation reproduction

## Environment

- Neon Data API with Neon Auth
- `pg_session_jwt` 0.5.0
- `@neondatabase/neon-js` 0.7.0-beta
- Vite and React browser client
- Production HTTPS application origin

No project identifiers, endpoint identifiers, credentials, tokens, cookies, user identifiers, or personal data are included in this reproduction.

## Expected flow

An authenticated browser request should propagate its validated JWT identity through the Data API into the PostgreSQL session context:

```text
Valid authenticated JWT
        |
        v
Neon Data API / PostgREST
        |
        v
request.jwt.claims / pg_session_jwt context
        |
        v
auth.uid() returns the authenticated user's UUID
```

## Intermittent actual flow

The request is accepted as the `authenticated` role and the RPC begins executing, but the PostgreSQL identity helper unexpectedly returns `NULL`:

```text
Valid authenticated JWT
        |
        v
Neon Data API accepts the request
        |
        v
PostgreSQL executes bootstrap_current_user()
        |
        v
auth.uid() unexpectedly returns NULL
        |
        v
RPC raises SQLSTATE 42501
```

The safe response body is:

```json
{
  "code": "42501",
  "message": "Authentication is required",
  "details": null,
  "hint": null
}
```

A subsequent request can succeed without application, database, authentication-provider, or production-configuration changes. No Neon-side logs are available, so this document does not infer a platform-internal mechanism beyond the observed PostgreSQL identity-context boundary.

## Confirmed exclusions

The captured failure was not caused by:

- an expired JWT
- a missing `Authorization` header
- an incorrect issuer or audience
- Google OAuth or its callback
- browser CORS
- function `EXECUTE` privilege
- row-level security
- a malformed UUID subject
- the wrong Neon branch
- the wrong Data API endpoint
- the wrong Neon Auth endpoint

The bearer token, cookie, user identity, endpoint identity, and project identity must remain redacted in any support exchange.
