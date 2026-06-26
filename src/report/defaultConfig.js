import { tableKey } from './reportSchema.js'
import { SCHEMAS } from './schemas.js'

// Routes the given operator runs, from meta.
export function operatorRoutes(meta, operator) {
  const op = meta?.operators?.find(o => o.name === operator)
  return op ? op.routes : []
}

// Build the initial customization config from the meta payload. Toggle state is
// built for BOTH report types (operator + route) so switching type preserves
// each type's toggles. Everything enabled; first operator + busiest route
// selected; full window.
export function buildDefaultConfig(meta) {
  const operator = meta?.operators?.[0]?.name || ''
  const route = meta?.routes?.[0]?.route || ''
  const win = meta?.window || {}

  const sections = {}
  const tables = {}
  const columns = {}
  for (const schema of Object.values(SCHEMAS)) {
    for (const section of schema) {
      sections[section.id] = true
      for (const table of section.tables) {
        const k = tableKey(section.id, table.id)
        tables[k] = !table.defaultOff
        columns[k] = Object.fromEntries(table.columns.map(c => [c.key, !c.defaultOff]))
      }
    }
  }

  return {
    reportType: 'operator',           // 'operator' | 'route'
    operator,
    route,
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
