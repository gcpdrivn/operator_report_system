import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks ONLY to /api/* — Vite proxies it to the central
// drivn-server (dev port 8080), the only process that touches BigQuery.
// The browser never holds BQ credentials or hits BQ directly.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/auth': { target: 'http://localhost:8080', changeOrigin: true }
    }
  }
})
