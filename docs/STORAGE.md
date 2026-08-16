# DataClass Storage

## Architecture

- **Neon:** authenticates the user, authorizes every resource action, and stores file metadata only.
- **Cloudflare Worker:** forwards the user's Neon bearer token to narrowly scoped RPCs, signs short-lived Backblaze requests, verifies uploaded objects, and deletes authorized objects. It never trusts a decoded token alone and does not proxy normal file bodies.
- **Backblaze B2:** stores lesson resource bytes in the private `dataclass-resources` bucket. Browser uploads use a five-minute presigned PUT; authorized downloads use a two-minute presigned GET.
- **YouTube:** remains the external host for OBS classroom recordings. Video and lesson-file storage are separate systems.

The browser never receives Backblaze credentials and cannot choose an object key. Object paths are generated database-side as opaque lesson/resource paths without names, emails, or tokens. PostgreSQL never stores file bodies, credentials, permanent B2 URLs, or presigned URLs.

## Resource policy

V1 accepts non-empty lesson resources up to 500 MiB with these extensions:

`.xlsx`, `.xls`, `.xlsm`, `.csv`, `.tsv`, `.pdf`, `.pbix`, `.pbit`, `.sql`, `.ipynb`, `.py`, `.txt`, `.json`, `.parquet`, `.zip`, `.docx`, and `.pptx`.

The allowlist is checked in the browser, Worker, and database. Filenames reject path separators, traversal sequences, control characters, hidden leading dots, and excessive length. Antivirus scanning and multipart upload are not part of Step 6B.

## Upload lifecycle

1. The authenticated teacher requests an upload intent.
2. Neon verifies class-owner or assigned-module-instructor access, generates the protected object path, and creates `pending` metadata.
3. The Worker returns a five-minute presigned PUT URL.
4. The browser uploads directly to B2.
5. The Worker authorizes finalization, checks the exact object and size with `HeadObject`, and marks the metadata `ready`.

Only `ready` resources appear to students. Abandoned `pending` rows are intentionally left for a future maintenance cleanup job.

## Local development

Worker secrets live only in ignored `.dev.vars`; `.dev.vars.example` contains placeholder names. The React app uses the browser-safe `VITE_STORAGE_API_URL`. Run the app and local Worker separately:

```text
npm run dev
npm run worker:dev
```

The private B2 bucket needs a development CORS rule restricted to `http://localhost:5173`, permitting `s3_put`, `s3_get`, and `s3_head`, allowing required request headers, exposing `ETag`, and using a 3600-second max age. A wildcard origin is not allowed. Production must add its exact application origin before deployment.

Current status: the private bucket has one exact development CORS rule for `http://localhost:5173`, permitting only PUT, GET, and HEAD with required request headers and exposing `ETag`. S3 API readback and live preflight checks passed. Real teacher E2E passed for authenticated upload intent, direct PUT, HeadObject finalization, ready metadata, and download authorization. Real student E2E passed for published-lesson listing, temporary download, file integrity, absence of delete controls, and draft-lesson hiding. Delete authorization and B2 DeleteObject compatibility were verified without deleting the retained E2E resource. Migration `0007` is validated in production with no resource data. The Worker has not been deployed, and production Worker secrets, exact application origin, and production B2 CORS are intentionally deferred until deployment/release preparation.
