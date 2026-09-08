# DataClass Production Deployment

DataClass production uses Vercel for the Vite frontend at [dataclass-two.vercel.app](https://dataclass-two.vercel.app), Neon for PostgreSQL/Auth/Data API, and a Cloudflare Worker with private Backblaze B2 for file operations.

The frontend requires the browser-visible names `VITE_NEON_DATABASE_URL` and `VITE_STORAGE_API_URL`. The Worker uses the normal variables and secrets listed in [Environment variables](ENVIRONMENT.md). No secret belongs in a `VITE_*` variable.

Production-origin configuration for Vercel, Neon Auth/Google OAuth, the Worker, and B2 CORS must stay aligned to the canonical HTTPS origin. Do not broaden production CORS or change platform configuration as part of a routine frontend deployment.

Follow the complete [Production deployment runbook](DEPLOYMENT_RUNBOOK.md), [Release checklist](RELEASE_CHECKLIST.md), and [Rollback runbook](ROLLBACK.md). The current public-release gates are in [Release status](RELEASE_STATUS.md).
