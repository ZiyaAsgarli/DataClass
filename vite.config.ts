import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function isLocalHostname(hostname: string) {
  return hostname === '[::1]'
    || hostname === '::1'
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

function browserEndpoint(
  name: 'VITE_NEON_DATABASE_URL' | 'VITE_STORAGE_API_URL',
  configuredValue: string,
  mode: string,
  developmentFallback = '',
) {
  const isProduction = mode === 'production'
  const value = configuredValue.trim() || (isProduction ? '' : developmentFallback)

  if (!value) {
    throw new Error(`Missing required ${isProduction ? 'production ' : ''}configuration: ${name}.`)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid browser endpoint configuration: ${name}.`)
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`Invalid browser endpoint configuration: ${name}.`)
  }

  if (isProduction && (url.protocol !== 'https:' || isLocalHostname(url.hostname))) {
    throw new Error(`Production configuration must use a non-local HTTPS endpoint: ${name}.`)
  }

  return value.replace(/\/+$/, '')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUrl = env.NEON_AUTH_BASE_URL || env.VITE_NEON_AUTH_URL || ''
  const derivedDatabaseUrl = authUrl
    .replace('.neonauth.', '.')
    .replace(/\/auth\/?$/, '')
  const databaseUrl = browserEndpoint(
    'VITE_NEON_DATABASE_URL',
    env.VITE_NEON_DATABASE_URL || derivedDatabaseUrl,
    mode,
  )
  const storageApiUrl = browserEndpoint(
    'VITE_STORAGE_API_URL',
    env.VITE_STORAGE_API_URL || '',
    mode,
    'http://localhost:8787',
  )

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_NEON_DATABASE_URL': JSON.stringify(databaseUrl),
      'import.meta.env.VITE_STORAGE_API_URL': JSON.stringify(storageApiUrl),
    },
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
  }
})
