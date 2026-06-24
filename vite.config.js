import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks ONLY to /api/* — Vite proxies it to the local report
// proxy server (server/index.js) on :8788, which is the only thing that
// touches BigQuery. The browser never holds BQ credentials or hits BQ directly.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  }
})
