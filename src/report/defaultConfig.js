import { REPORT_SCHEMA, tableKey } from './reportSchema.js'

// Routes the given operator runs, from meta.
export function operatorRoutes(meta, operator) {
  const op = meta?.operators?.find(o => o.name === operator)
  return op ? op.routes : []
}

// Build the initial customization config from the meta payload: everything
// enabled, first operator selected, full window, first two routes chosen for
// the competitive leaderboards.
export function buildDefaultConfig(meta) {
  const operator = meta?.operators?.[0]?.name || ''
  const win = meta?.window || {}

  const sections = {}
  const tables = {}
  const columns = {}
  for (const section of REPORT_SCHEMA) {
    sections[section.id] = true
    for (const table of section.tables) {
      const k = tableKey(section.id, table.id)
      tables[k] = !table.defaultOff
      // Columns default on unless flagged defaultOff (optional/extra columns).
      columns[k] = Object.fromEntries(table.columns.map(c => [c.key, !c.defaultOff]))
    }
  }

  return {
    operator,
    from: win.start || '',
    to: win.end || '',
    competitiveRoutes: [],            // auto-filled from the report's in-range routes once data loads
    comparisonOperators: [],          // §6/§7 — auto-filled to the top 2 once data loads
    suggestedCriteria: 'revenue',     // 'revenue' | 'occupancy' | 'both'
    suggestedPresence: 'all',         // 'all' | 'serves' | 'absent'
    sections,
    tables,
    columns,
  }
}
