import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join, resolve, isAbsolute } from 'path'
import { existsSync } from 'fs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(SERVER_DIR, '.env') })

// Anchor a relative GOOGLE_APPLICATION_CREDENTIALS against server/ for
// consistent behavior regardless of launch directory.
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (credPath && !isAbsolute(credPath)) {
  const abs = resolve(SERVER_DIR, credPath)
  if (existsSync(abs)) process.env.GOOGLE_APPLICATION_CREDENTIALS = abs
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import { getMeta, getReport, getRouteReport } from './report.js'

const PORT = Number(process.env.PORT || 8788)
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn('[warn] GOOGLE_APPLICATION_CREDENTIALS not set; falling back to ADC')
}

// CORS: lock to an allow-list from env in production; reflect origin in dev
// (dev uses the Vite proxy, so CORS isn't exercised there anyway).
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
const corsOrigin = corsOrigins.length ? corsOrigins : true

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ---- Meta cache (small, drives the pickers; window is needed to clamp dates) ----
let metaCache = null
let metaInFlight = null
async function getMetaCached({ force = false } = {}) {
  if (!force && metaCache && Date.now() - metaCache.ts < CACHE_TTL_MS) {
    return { meta: metaCache.meta, fromCache: true }
  }
  if (metaInFlight) return { meta: await metaInFlight, fromCache: false }
  metaInFlight = (async () => {
    try {
      const meta = await getMeta()
      metaCache = { meta, ts: Date.now() }
      return meta
    } finally { metaInFlight = null }
  })()
  return { meta: await metaInFlight, fromCache: false }
}

// ---- Report cache (keyed string), with per-key coalescing ----
const reportCache = new Map()    // key -> { payload, ts }
const reportInFlight = new Map() // key -> Promise
async function cachedReport(key, build, { force = false } = {}) {
  const hit = reportCache.get(key)
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { payload: hit.payload, fromCache: true }
  }
  if (reportInFlight.has(key)) return { payload: await reportInFlight.get(key), fromCache: false }
  const p = (async () => {
    try {
      const t0 = Date.now()
      const payload = await build()
      payload.meta = { ...payload.meta, queryMs: Date.now() - t0 }
      reportCache.set(key, { payload, ts: Date.now() })
      return payload
    } finally { reportInFlight.delete(key) }
  })()
  reportInFlight.set(key, p)
  return { payload: await p, fromCache: false }
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } })
await app.register(compress, { global: true, threshold: 1024, encodings: ['gzip', 'br'] })
await app.register(cors, { origin: corsOrigin })

app.get('/api/health', async () => ({ ok: true, cachedAt: metaCache?.ts ?? null }))

app.get('/api/report/meta', async (req, reply) => {
  try {
    const { meta, fromCache } = await getMetaCached({ force: req.query?.refresh === '1' })
    reply.header('x-cache', fromCache ? 'HIT' : 'MISS')
    return meta
  } catch (err) {
    req.log.error({ err: err.message }, 'meta failed')
    reply.code(500)
    return { error: err.message || String(err) }
  }
})

app.get('/api/report', async (req, reply) => {
  const type = (req.query?.type || 'operator').trim()
  let from = (req.query?.from || '').trim()
  let to = (req.query?.to || '').trim()

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    reply.code(400); return { error: 'from and to must be YYYY-MM-DD dates' }
  }
  if (from > to) { reply.code(400); return { error: 'from must be on or before to' } }

  // Build the subject + cache key + builder for the requested report type.
  let key, build
  if (type === 'route') {
    const route = (req.query?.route || '').trim()
    if (!route) { reply.code(400); return { error: 'route is required' } }
    key = `route|${route}`
    build = (f, t) => getRouteReport({ route, from: f, to: t })
  } else {
    const operator = (req.query?.operator || '').trim()
    if (!operator) { reply.code(400); return { error: 'operator is required' } }
    key = `op|${operator}`
    build = (f, t) => getReport({ operator, from: f, to: t })
  }

  try {
    // Clamp the requested range to the loaded MV window so a request can't
    // ask for data outside what _fact_trips holds.
    let clamped = false
    try {
      const { meta } = await getMetaCached()
      const w = meta.window || {}
      if (w.start && from < w.start) { from = w.start; clamped = true }
      if (w.end && to > w.end) { to = w.end; clamped = true }
    } catch { /* if meta fails, proceed with validated dates */ }

    const { payload, fromCache } = await cachedReport(
      `${key}|${from}|${to}`,
      () => build(from, to),
      { force: req.query?.refresh === '1' }
    )
    if (clamped) payload.meta = { ...payload.meta, clamped: true }
    reply.header('x-cache', fromCache ? 'HIT' : 'MISS')
    return payload
  } catch (err) {
    req.log.error({ err: err.message }, 'report failed')
    reply.code(500)
    return { error: err.message || String(err) }
  }
})

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(addr => app.log.info(`Operator report proxy listening on ${addr}`))
  .catch(err => { app.log.error(err); process.exit(1) })
