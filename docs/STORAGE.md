# DataClass Storage

## Architecture

- **Neon:** authenticates the user, authorizes every resource action, and stores file metadata only.
- **Cloudflare Worker:** forwards the user's Neon bearer token to narrowly scoped RPCs, signs short-lived Backblaze requests, verifies uploaded objects, and deletes authorized objects. It never trusts a decoded token alone and does not proxy normal file bodies.
- **Backblaze B2:** stores lesson resources, assignment resources, and submission files in the private `dataclass-resources` bucket. Browser uploads use a five-minute presigned PUT; authorized downloads use a two-minute presigned GET.
- **YouTube:** remains the external host for OBS classroom recordings. Video and lesson-file storage are separate systems.

The browser never receives Backblaze credentials and cannot choose an object key. Object paths are generated database-side as opaque lesson/resource, assignment/resource, or submission/version/file paths without names, emails, or tokens. PostgreSQL never stores file bodies, credentials, permanent B2 URLs, or presigned URLs.

## Resource policy

V1 accepts non-empty lesson, assignment, and submission files up to 500 MiB per file with these extensions:

`.xlsx`, `.xls`, `.xlsm`, `.csv`, `.tsv`, `.pdf`, `.pbix`, `.pbit`, `.sql`, `.ipynb`, `.py`, `.txt`, `.json`, `.parquet`, `.zip`, `.docx`, and `.pptx`.

The allowlist is checked in the browser, Worker, and database. Filenames reject path separators, traversal sequences, control characters, hidden leading dots, and excessive length. Antivirus scanning and multipart upload are not part of Step 6B.

## Upload lifecycle

1. The authenticated teacher requests an upload intent.
2. Neon verifies class-owner or assigned-module-instructor access, generates the protected object path, and creates `pending` metadata.
3. The Worker returns a five-minute presigned PUT URL.
4. The browser uploads directly to B2.
5. The Worker authorizes finalization, checks the exact object and size with `HeadObject`, and marks the metadata `ready`.

Only `ready` resources/files appear to authorized users. Assignment resources additionally require a published assignment for student access. Submission files remain scoped to the submitting student and authorized teacher. Abandoned `pending` rows are intentionally left for a future maintenance cleanup job.

## Assignment and submission storage

- Assignment resources reuse the existing signing Worker and are stored under opaque assignment/resource paths. Only an authorized owner or lesson-module instructor can upload or delete them; students can download ready resources for their published assignments.
- Submission files use one logical submission row and immutable integer versions. A student's first completed upload is version 1; a revision-requested resubmission advances the version and retains the older files.
- The Worker obtains authorization from Neon for every intent, finalize, download, and permitted delete. It never trusts browser-supplied identity or object paths, and normal file bytes continue to travel directly between the browser and B2.
- The Worker remains local-only. Step 7 and its production database promotion do not deploy it or change production-origin CORS.

## Local development

Worker secrets live only in ignored `.dev.vars`; `.dev.vars.example` contains placeholder names. The React app uses the browser-safe `VITE_STORAGE_API_URL`. Run the app and local Worker separately:

```text
npm run dev
npm run worker:dev
```

The private B2 bucket needs a development CORS rule restricted to `http://localhost:5173`, permitting `s3_put`, `s3_get`, and `s3_head`, allowing required request headers, exposing `ETag`, and using a 3600-second max age. A wildcard origin is not allowed. Production must add its exact application origin before deployment.

Current status: the private bucket has one exact development CORS rule for `http://localhost:5173`, permitting only PUT, GET, and HEAD with required request headers and exposing `ETag`. S3 API readback and live preflight checks passed. Real teacher E2E passed for authenticated upload intent, direct PUT, HeadObject finalization, ready metadata, and download authorization. Real student E2E passed for published-lesson listing, temporary download, file integrity, absence of delete controls, and draft-lesson hiding. Delete authorization and B2 DeleteObject compatibility were verified without deleting the retained E2E resource. Migration `0007` is validated in production with no resource data. The Worker has not been deployed, and production Worker secrets, exact application origin, and production B2 CORS are intentionally deferred until deployment/release preparation.

Step 7 assignment resources and submission files passed the real two-account workflow, including revision-requested Version 2 upload, preservation and authorized download of both versions, and final review. Migration `0008` is now validated in production with no resource or submission data. Shared download signing uses a quoted ASCII fallback plus RFC 5987 `filename*` encoding, including safe handling of spaces, parentheses, Unicode/Azerbaijani characters, punctuation, and control-character injection attempts. The Worker remains undeployed and no production B2 objects were created.
