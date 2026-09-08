# Production Security Notes

- Google OAuth and Neon Auth establish the signed user session.
- PostgreSQL RLS and authorized RPCs derive teacher/student identity and enforce class ownership, instructor scope, membership, lesson visibility, assignments, submissions, and resource access.
- The browser contains no PostgreSQL credential and must never receive a privileged database credential.
- Backblaze B2 is private. The Cloudflare Worker is the storage authorization boundary and holds B2 credentials outside the browser.
- Authorized file access uses short-lived signed object URLs. Normal file bytes transfer directly between the browser and B2.
- Production CORS must name the exact application origin. Wildcard production CORS is not acceptable for authenticated storage flows.
- Secrets belong only in the relevant platform secret store or ignored local files. Logs and support artifacts must exclude tokens, credentials, personal identifiers, and signed URLs.
- The authorization model does not trust a browser-supplied user identifier or object key.
- An external Neon issue can intermittently remove the PostgreSQL request identity for a valid JWT. DataClass does not bypass RLS, invent an identity, or replay arbitrary mutations in response. See [Known issues](KNOWN_ISSUES.md).
