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

export async function getCurrentNeonAuthToken() {
  const sessionResult = await neonClient.auth.getSession()
  if (sessionResult.error) throw sessionResult.error
  return sessionResult.data?.session?.token ?? null
}
