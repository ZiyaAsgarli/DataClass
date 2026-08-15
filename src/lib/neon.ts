import { createClient, defaultDeriveNeonUrls } from '@neondatabase/neon-js'

const neonDatabaseUrl = import.meta.env.VITE_NEON_DATABASE_URL

if (!neonDatabaseUrl) {
  throw new Error('Missing browser-safe Neon database URL configuration.')
}

const endpoints = defaultDeriveNeonUrls(neonDatabaseUrl)

export const neonClient = createClient({
  auth: { url: endpoints.auth },
  dataApi: { url: endpoints.dataApi },
})
