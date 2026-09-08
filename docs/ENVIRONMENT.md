# Environment Variables

This document lists variable names only. Values belong in the relevant deployment platform or ignored local environment files.

## Frontend and build inputs

| Name | Classification | Requirement | Purpose |
| --- | --- | --- | --- |
| `VITE_NEON_DATABASE_URL` | PUBLIC | Required in production | Browser-safe Neon SDK/Data API base URL; never a PostgreSQL connection string |
| `VITE_STORAGE_API_URL` | PUBLIC | Required in production | HTTPS URL of the deployed storage Worker |
| `VITE_NEON_AUTH_URL` | PUBLIC | Optional compatibility input | Allows the build to derive the browser-safe Neon database URL when the canonical variable is absent |
| `NEON_AUTH_BASE_URL` | SERVER-ONLY build input | Optional compatibility input | Local/build-tool Neon Auth base URL used only to derive the browser-safe database URL when the canonical variable is absent |

All `VITE_*` variables are embedded in browser code and must be treated as public. Database credentials, OAuth secrets, and B2 credentials must never use that prefix.

## Worker non-secret variables

| Name | Classification | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | SERVER-ONLY | Exact allowed production application origin |
| `NEON_DATA_API_URL` | SERVER-ONLY | Neon Data API endpoint used for authorized RPC calls |
| `B2_BUCKET_NAME` | SERVER-ONLY | Private storage bucket name |
| `B2_S3_ENDPOINT` | SERVER-ONLY | B2 S3-compatible endpoint |
| `B2_REGION` | SERVER-ONLY | B2 S3 region |

## Worker secrets

| Name | Classification | Purpose |
| --- | --- | --- |
| `B2_KEY_ID` | SECRET | B2 application-key identifier |
| `B2_APPLICATION_KEY` | SECRET | B2 application key material |

Worker secrets belong in Cloudflare secret storage or the ignored local `.dev.vars` file. They must not be committed, logged, copied into documentation, or sent to the browser.
