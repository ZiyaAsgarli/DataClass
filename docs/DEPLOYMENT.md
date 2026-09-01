# DataClass Production Deployment

## Initial launch target

The initial limited real-class launch uses Vercel for the Vite frontend and the free Vercel production hostname:

```text
https://<final-vercel-project-name>.vercel.app
```

The exact hostname is intentionally unknown until the first Vercel deployment in Step 13.3. Do not guess or commit a hostname. A custom domain can replace the Vercel hostname later, after repeating the origin-dependent configuration below.

Vercel should use its normal npm install step, Node 24.x, the repository `npm run build` command, and the `dist` output directory. The root `vercel.json` sends direct SPA navigation to `index.html`; React Router continues to resolve `/login`, `/auth/callback`, and protected teacher/student deep links.

## Frontend environment

Configure these browser-visible variables in Vercel production settings:

- `VITE_NEON_DATABASE_URL` — browser-safe production Neon SDK base URL; never a PostgreSQL connection string.
- `VITE_STORAGE_API_URL` — deployed production Cloudflare Worker HTTPS URL.

`NEON_AUTH_BASE_URL` and `VITE_NEON_AUTH_URL` remain compatibility inputs for local tooling only when `VITE_NEON_DATABASE_URL` is not supplied. No secret belongs in a `VITE_*` variable. Production builds fail when either required browser endpoint is missing, malformed, non-HTTPS, or local.

## Origin-dependent configuration

After Step 13.3 returns the exact Vercel hostname, use that exact HTTPS origin for:

- Neon Auth trusted-domain configuration;
- the DataClass/Google OAuth authorized origin and callback configuration required by the existing Neon Auth flow;
- the production Worker `APP_ORIGIN` variable;
- the production Backblaze B2 CORS rule.

These settings must not be configured with a guessed Vercel hostname. If a custom domain is introduced later, choose one canonical host and repeat every origin-dependent setting before redirecting traffic.

## Cloudflare Worker production environment

`wrangler.jsonc` keeps the top-level environment for local development and declares a separate `production` environment. The production environment intentionally has no normal variables yet because the final frontend origin is unknown. Before any production Worker deployment, add the exact non-secret production values for:

- `APP_ORIGIN`
- `NEON_DATA_API_URL`
- `B2_BUCKET_NAME`
- `B2_S3_ENDPOINT`
- `B2_REGION`

The production environment declares these required secret names without values:

- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

Set their values only through Cloudflare's encrypted secret mechanism. Never place them in the repository, documentation, Vercel variables, or frontend bundle. Do not deploy the production environment while its normal variables are intentionally incomplete.

## Deployment sequence after repository approval

1. Create the Vercel project and make the initial frontend deployment with the production Neon browser endpoint and a temporary valid HTTPS storage endpoint only if needed to satisfy the build gate.
2. Record the exact stable Vercel production hostname.
3. Configure the hostname as a trusted Neon Auth domain and update the existing Google/Neon OAuth origin and callback settings.
4. Complete the Wrangler production normal variables using the exact Vercel origin and production service endpoints.
5. Set the two production Worker secrets through Wrangler/Cloudflare and deploy the Worker production environment.
6. Restrict Worker CORS to the exact Vercel origin and configure the private B2 bucket CORS for that same origin and only the required methods/headers.
7. Set Vercel `VITE_STORAGE_API_URL` to the deployed Worker HTTPS URL and redeploy the frontend.
8. Run authentication, deep-link refresh, upload/finalize/download, localization, theme, and sign-out smoke tests before creating real class data.

Production application tables remain empty throughout infrastructure deployment. Real teacher, group, module, lesson, assignment, submission, and file data must be created intentionally during the later real-class launch.
