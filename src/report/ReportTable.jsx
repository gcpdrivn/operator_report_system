import Stat from '../components/Stat.jsx'
import { FORMATTERS, applyTokens } from '../lib/format.js'
import { getByPath } from '../lib/path.js'
import { tableKey } from './reportSchema.js'
import { crossOperatorView, suggestedView } from './views.js'

// Renders the inner content of one schema table (the surrounding Card is added
// by SectionBlock). Honors per-column toggles. Handles three kinds:
//   kpi            -> Stat tiles from a single metric object
//   grid           -> a static table from a row array
//   dynamicByRoute -> one labeled sub-table per chosen competitive route
export default function ReportTable({ table, sectionId, payload, config }) {
  const key = tableKey(sectionId, table.id)
  const op = payload?.operator

  // Dynamic tables: columns/rows are computed (depend on chosen comparison
  // operators / criteria), so they come from a view-builder, not the schema.
  if (table.kind === 'crossOperator' || table.kind === 'suggested') {
    const view = table.kind === 'crossOperator' ? crossOperatorView(payload, config) : suggestedView(payload, config)
    if (!view.columns.length || !view.rows.length) return <Empty>{view.empty || 'Nothing to show.'}</Empty>
    return <Grid columns={view.columns} rows={view.rows} />
  }

  const enabledCols = table.columns
    .filter(c => config.columns[key]?.[c.key] !== false)
    .map(c => ({ ...c, label: applyTokens(c.label, op) }))   // resolve {operator}
  if (enabledCols.length === 0) {
    return <Empty>All columns hidden.</Empty>
  }

  if (table.kind === 'kpi') {
    const obj = getByPath(payload, table.field) || {}
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18
      }}>
        {enabledCols.map(c => (
          <Stat key={c.key} label={c.label}
            value={FORMATTERS[c.format](obj[c.key], obj)}
            accent="var(--accent-strong)" />
        ))}
      </div>
    )
  }

  if (table.dynamicByRoute) {
    const data = getByPath(payload, table.field) || {}
    const routes = config.competitiveRoutes || []
    if (routes.length === 0) return <Empty>Pick one or two routes in the controls to populate this table.</Empty>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {routes.map(routeId => {
          const block = data[routeId]
          if (!block) return <Empty key={routeId}>No data for {routeId}.</Empty>
          return (
            <div key={routeId}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                {block.routeLabel}
              </div>
              <Grid columns={enabledCols} rows={block.rows} />
              {block.rankNote && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                  {block.rankNote}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const rows = getByPath(payload, table.field) || []
  return <Grid columns={enabledCols} rows={rows} />
}

function Grid({ columns, rows }) {
  if (!rows || rows.length === 0) return <Empty>No rows.</Empty>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="report-table">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const cls = row.isTotal ? 'report-total' : row.isSubject ? 'report-subject' : ''
            return (
              <tr key={ri} className={cls}>
                {columns.map(c => (
                  <td key={c.key} style={{ textAlign: c.align || 'left', fontWeight: c.bold ? 600 : undefined }}>
                    {FORMATTERS[c.format](row[c.key], row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 14 }}>{children}</div>
}
