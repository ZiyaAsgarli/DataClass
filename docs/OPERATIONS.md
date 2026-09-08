# Operations and Support Runbook

Use read-only inspection first. Preserve sanitized timestamps, route names, HTTP status, PostgreSQL code, deployment commit, and request phase where available. Never print or copy tokens, credentials, signed URLs, or personal identifiers into support notes.

| Symptom | Safe first check | Inspect | Do not do |
| --- | --- | --- | --- |
| User cannot log in | Reproduce the login page and one normal Google sign-in attempt | Vercel deployment status, browser-safe error category, Neon Auth service status, configured redirect/origin names | Do not change OAuth configuration ad hoc or expose session data |
| User gets the wrong role | Confirm which workspace and navigation the authenticated session receives | Sanitized profile/role RPC result and database role-assignment audit trail | Do not trust a browser-supplied role or edit membership without authorization |
| Lesson video is missing | Confirm the lesson is published and whether the embed placeholder or an asset error appears | Authorized lesson detail, stored YouTube metadata, browser console/network for the embed host | Do not upload a replacement video or alter lesson content during diagnosis |
| Lesson resource is inaccessible | Check whether the metadata is `ready` and the user is authorized for the published lesson | Worker status, sanitized authorization response, B2 object existence through approved server-side tooling | Do not retry finalize/delete, reveal a signed URL, or touch the frozen Lesson 1 objects |
| Assignment is invisible | Confirm assignment publication/state and active class membership | Authorized assignment-list RPC, lesson/module visibility, sanitized `42501` classification | Do not publish/edit the assignment or add membership as a diagnostic |
| Submission is inaccessible | Confirm the viewer is the submitting student or an authorized teacher | Authorized submission-detail response, assignment state, version metadata | Do not change status, upload a version, or bypass the authorized RPC |
| Worker is unavailable | Check the deployed Worker health/status and one unauthenticated protected request | Cloudflare deployment/logs with secret values redacted, exact allowed-origin setting, current approved version | Do not redeploy unrelated code, broaden CORS, or print variables/secrets |
| B2 upload failed | Determine whether failure occurred before PUT, during PUT, or after object verification | Sanitized Worker phase/status, B2 service status, metadata/object state through approved read-only checks | Do not replay the upload/finalize or delete an object to force consistency |
| Neon identity request returns `42501` | Classify the known symptom and stop the authorization-critical flow | Sanitized app/Worker phase, Neon support case, [identity reproduction](NEON_DATA_API_IDENTITY_REPRO.md) | Do not resume diagnostics, invent/copy a JWT, add retries, replay a mutation, or bypass RLS |
| Vercel deployment failed | Match the failed deployment to its exact commit and read the build error | Vercel build log, required public variable names, Node/npm/check results | Do not change production variables blindly or promote a different commit |
