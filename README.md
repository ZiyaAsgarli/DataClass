# DataClass

DataClass is a bilingual learning platform for data analytics courses. It provides Google authentication, teacher and student workspaces, classes and membership, ordered course modules and lessons, YouTube lesson recordings, private course files, assignments, versioned submissions, and teacher revision/review workflows.

The production frontend is a Vite, React, and TypeScript single-page application hosted by Vercel at [dataclass-two.vercel.app](https://dataclass-two.vercel.app). Neon PostgreSQL, Neon Auth, and the Neon Data API provide data and identity. A Cloudflare Worker authorizes and signs short-lived requests for a private Backblaze B2 bucket; file bytes travel directly between the browser and B2. Lesson recordings are hosted as YouTube Unlisted videos.

## Local development

Use Node.js 24.x.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and configure the browser-visible variable names described in [Environment](docs/ENVIRONMENT.md).
3. Run `npm run dev`.

For local storage work, configure the server-only names in `.dev.vars.example` and run `npm run worker:dev` separately. Never put database credentials or B2 credentials in a `VITE_*` variable.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm test` runs the deterministic Node test suite.
- `npm run lint` runs Oxlint.
- `npm run build` type-checks and builds the frontend.
- `npm run preview` serves the built frontend locally.
- `npm run worker:dev` starts the storage Worker locally.
- `npm run worker:check` type-checks the Worker.
- `npm run worker:types` regenerates Worker binding types.

## Production status

The application and product QA are complete. Public release remains on hold because an intermittent Neon Data API identity-context issue can make `auth.uid()` null for a valid authenticated request. Final production storage validation and cleanup of the frozen Lesson 1 XLSX state wait for the platform/root-strategy decision. See [Release status](docs/RELEASE_STATUS.md) and [Known issues](docs/KNOWN_ISSUES.md).

## Documentation

- [V1 release inventory](docs/RELEASE_V1.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Release status](docs/RELEASE_STATUS.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment runbook](docs/DEPLOYMENT_RUNBOOK.md)
- [Rollback runbook](docs/ROLLBACK.md)
- [Operations runbook](docs/OPERATIONS.md)
- [Security notes](docs/SECURITY.md)
- [Known issues](docs/KNOWN_ISSUES.md)
- [Database architecture](docs/DATABASE.md)
- [Storage architecture](docs/STORAGE.md)
- [Neon identity reproduction](docs/NEON_DATA_API_IDENTITY_REPRO.md)
- [Authorization fallback design](docs/AUTH_ARCHITECTURE_FALLBACK.md)
