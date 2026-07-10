import * as XLSX from 'xlsx'
import { tableKey } from '../reportSchema.js'
import { FORMATTERS, applyTokens } from '../../lib/format.js'
import { getByPath } from '../../lib/path.js'
import { crossOperatorView, suggestedView } from '../views.js'

// One worksheet per enabled section; tables stack vertically with a title row,
// a header row, then data rows. Honors section/table/column toggles and reuses
// the same format tokens as the preview so Excel text matches the screen.
export function exportXlsx(config, payload, schema) {
  const wb = XLSX.utils.book_new()
  const op = payload?.operator

  for (const section of schema) {
    if (config.sections[section.id] === false) continue
    const aoa = []

    for (const table of section.tables) {
      const k = tableKey(section.id, table.id)
      if (config.tables[k] === false) continue

      // Dynamic tables: columns/rows come from the view-builders (same as preview).
      if (table.kind === 'crossOperator' || table.kind === 'suggested') {
        const view = table.kind === 'crossOperator' ? crossOperatorView(payload, config) : suggestedView(payload, config)
        if (!view.rows.length) continue
        aoa.push([applyTokens(table.title, op)])
        aoa.push(view.columns.map(c => c.label))
        for (const row of view.rows) aoa.push(view.columns.map(c => FORMATTERS[c.format](row[c.key], row)))
        aoa.push([])
        continue
      }

      const cols = table.columns.filter(c => config.columns[k]?.[c.key] !== false)
      if (cols.length === 0) continue

      let blocks
      if (table.dynamicByRoute) {
        const data = getByPath(payload, table.field) || {}
        blocks = (config.competitiveRoutes || [])
          .map(rid => data[rid] && { title: data[rid].routeLabel, rows: data[rid].rows })
          .filter(Boolean)
      } else if (table.kind === 'kpi') {
        blocks = [{ title: table.title, rows: [getByPath(payload, table.field) || {}] }]
      } else {
        blocks = [{ title: table.title, rows: getByPath(payload, table.field) || [] }]
      }

      for (const b of blocks) {
        aoa.push([applyTokens(b.title, op)])
        aoa.push(cols.map(c => applyTokens(c.label, op)))
        for (const row of b.rows) aoa.push(cols.map(c => FORMATTERS[c.format](row[c.key], row)))
        aoa.push([])
      }
    }

    if (aoa.length === 0) continue
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Excel sheet names max 31 chars, no []:*?/\
    const name = section.title.replace(/^[0-9]+\.\s*/, '').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const safe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '-')
  const kind = payload.route ? 'Route' : 'Operator'
  const subject = payload.route
    ? `${payload.route}${payload.routeOperator ? ` - ${payload.routeOperator}` : ''}`
    : payload.operator
  const classTag = payload.busClass ? `_${payload.busClass}` : ''
  const fname = `${kind}_Report_${safe(subject)}${classTag}_${safe(payload.meta?.from)}_${safe(payload.meta?.to)}.xlsx`
  XLSX.writeFile(wb, fname)
}
