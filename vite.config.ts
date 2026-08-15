import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUrl = env.NEON_AUTH_BASE_URL || env.VITE_NEON_AUTH_URL || ''
  const databaseUrl = authUrl
    .replace('.neonauth.', '.')
    .replace(/\/auth\/?$/, '')

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_NEON_DATABASE_URL': JSON.stringify(
        env.VITE_NEON_DATABASE_URL || databaseUrl,
      ),
    },
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
  }
})
