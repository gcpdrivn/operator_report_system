// View-builders for the two dynamic tables (Cross-Operator Comparison and
// Suggested Routes). Each returns { columns, rows } in the same shape the Grid
// renderer and the XLSX exporter consume, so preview and export stay in sync.
// Columns are dynamic (depend on selected comparison operators / criteria), so
// they can't live statically in reportSchema.
import { FORMATTERS } from '../lib/format.js'

const comparisons = (payload, config) =>
  (config.comparisonOperators || []).filter(Boolean).filter(o => o !== payload.operator)

// §6 — subject + each chosen comparison operator, across the subject's routes.
export function crossOperatorView(payload, config) {
  const co = payload?.crossOperator
  if (!co || !co.routes?.length) return { columns: [], rows: [], empty: 'No comparison data for this operator.' }
  const subject = payload.operator
  const ops = [subject, ...comparisons(payload, config)]

  const colCfg = config.columns['crossOperator.comparison'] || {}
  const metrics = [
    { key: 'occ', label: 'Occ', fmt: 'pct1' },
    { key: 'asp', label: 'ASP', fmt: 'rupee' },
    { key: 'rtrip', label: 'R/Trip', fmt: 'rupee' },
  ].filter(m => colCfg[m.key] !== false)

  const columns = [{ key: 'route', label: 'Route', format: 'text', align: 'left', bold: true }]
  for (const m of metrics) {
    for (const op of ops) {
      columns.push({ key: `${m.key}__${op}`, label: `${op} ${m.label}`, format: 'text', align: 'right', bold: op === subject })
    }
  }

  const rows = co.routes.map(r => {
    const row = { route: r.route }
    for (const m of metrics) {
      for (const op of ops) {
        const cell = r.ops[op]
        // Absent operator on this route: show "Not Running" in the Occ column, "—" elsewhere.
        row[`${m.key}__${op}`] = cell ? FORMATTERS[m.fmt](cell[m.key]) : (m.key === 'occ' ? 'Not Running' : '—')
      }
    }
    return row
  })
  return { columns, rows }
}

// §7 — top 10 market corridors, ranked + filtered client-side.
export function suggestedView(payload, config) {
  const s = payload?.suggested
  if (!s || !s.routes?.length) return { columns: [], rows: [], empty: 'No market data.' }
  const subject = payload.operator
  const comps = comparisons(payload, config)

  let routes = s.routes.slice()
  if (config.suggestedPresence === 'serves') routes = routes.filter(r => r.subjectRuns)
  else if (config.suggestedPresence === 'absent') routes = routes.filter(r => !r.subjectRuns)

  const maxRev = Math.max(1, ...routes.map(r => r.mktRevDay || 0))
  const crit = config.suggestedCriteria || 'revenue'
  const score = r =>
    crit === 'occupancy' ? (r.mktOcc || 0)
      : crit === 'both' ? (0.5 * (r.mktRevDay || 0) / maxRev + 0.5 * (r.mktOcc || 0) / 100)
        : (r.mktRevDay || 0)
  routes = routes.sort((a, b) => score(b) - score(a)).slice(0, 10).map((r, i) => ({ ...r, rank: i + 1 }))

  const colCfg = config.columns['suggested.topRoutes'] || {}
  const on = k => colCfg[k] !== false
  const columns = []
  const add = (k, label, format, align, extra = {}) => { if (on(k)) columns.push({ key: k, label, format, align, ...extra }) }
  add('rank', 'Rank', 'int', 'right')
  add('route', 'Route', 'text', 'left', { bold: true })
  add('distanceKm', 'Distance (km)', 'dash', 'right')
  add('mktRevDay', 'Mkt Rev / Day (₹L)', 'rupeeLakh2', 'right')
  add('mktOcc', 'Mkt Occ', 'pct1', 'right')
  add('tripsDay', 'Trips/Day', 'int', 'right')
  add('evPct', 'EV Now %', 'pct1', 'right')
  add('operators', 'Operators', 'int', 'right')
  if (on('subjectFlag')) columns.push({ key: 'subjectFlag', label: `${subject}?`, format: 'text', align: 'center', bold: true })
  if (on('compFlags')) for (const op of comps) columns.push({ key: `flag__${op}`, label: `${op}?`, format: 'text', align: 'center' })

  const rows = routes.map(r => {
    const row = { ...r, subjectFlag: r.subjectRuns ? 'Yes' : 'No' }
    for (const op of comps) row[`flag__${op}`] = (r.ops || []).includes(op) ? 'Yes' : 'No'
    return row
  })
  return { columns, rows }
}
