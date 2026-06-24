import { BigQuery } from '@google-cloud/bigquery'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Lazy-init so env vars (loaded by index.js via dotenv) are available
// regardless of ES module import ordering.
let bq = null
let location = null

function client() {
  if (bq) return bq
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT env var is required')
  location = process.env.BQ_LOCATION || 'US'

  // Resolve a relative GOOGLE_APPLICATION_CREDENTIALS against server/ so the
  // server works the same regardless of which directory it was launched from.
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS
  let authMode = 'ADC (gcloud user credentials)'
  if (cred) {
    const abs = resolve(dirname(fileURLToPath(import.meta.url)), cred)
    if (!existsSync(abs)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS points to ${abs} but the file does not exist`)
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = abs
    authMode = `service account key (${abs})`
  }
  // eslint-disable-next-line no-console
  console.log(`[bq] auth: ${authMode}`)

  bq = new BigQuery({ projectId })
  return bq
}

// Read-only guard. Defense in depth — every SQL string passed in must look
// like a SELECT (or WITH ... SELECT). Anything else throws before hitting BQ.
const READ_ONLY_RE = /^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(SELECT|WITH)\b/i
const FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|REPLACE|GRANT|REVOKE|CALL|EXPORT)\b/i

// Cost guardrail: a query that would scan more than this many bytes fails fast
// instead of billing. _fact_trips is a tiny rolling window, far under this cap.
const MAX_BYTES = process.env.BQ_MAX_BYTES_BILLED || '2000000000' // ~2 GB

/**
 * Run a read-only, parameterized query.
 *   sql    — SELECT/WITH statement using named @params
 *   params — { name: value } map bound as named parameters
 *   types  — optional { name: type } for params BQ can't infer (NULLs / arrays),
 *            e.g. { from: 'DATE', topRoutes: ['STRING'] }
 */
export async function runSelect(sql, params = undefined, types = undefined) {
  if (!READ_ONLY_RE.test(sql)) {
    throw new Error('Query rejected: only SELECT/WITH statements are allowed')
  }
  if (FORBIDDEN_RE.test(sql)) {
    throw new Error('Query rejected: contains a forbidden write keyword')
  }
  const opts = {
    query: sql,
    location,
    useLegacySql: false,
    useQueryCache: true,
    maximumBytesBilled: MAX_BYTES
  }
  if (params) opts.params = params
  if (types) opts.types = types
  const [rows] = await client().query(opts)
  return rows.map(normalizeRow)
}

// BigQuery's Node client wraps DATE/TIMESTAMP/TIME/DATETIME values in
// { value: '...' } objects. We want plain strings, so flatten.
function normalizeRow(row) {
  const out = {}
  for (const k of Object.keys(row)) {
    const v = row[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v && Object.keys(v).length === 1) {
      out[k] = v.value
    } else {
      out[k] = v
    }
  }
  return out
}
