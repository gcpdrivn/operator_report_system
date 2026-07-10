import Card from '../components/Card.jsx'
import ReportTable from './ReportTable.jsx'
import { tableKey } from './reportSchema.js'
import { applyTokens } from '../lib/format.js'

const arrowRoute = r => String(r || '').replace(' -> ', ' → ')

// Renders one report section: a heading plus a Card per enabled table.
export default function SectionBlock({ section, payload, config }) {
  const op = payload?.operator
  const enabledTables = section.tables.filter(t => config.tables[tableKey(section.id, t.id)] !== false)
  if (enabledTables.length === 0) return null

  // Route reports narrowed to one operator: rewrite the scope pill for the
  // operator-scoped sections (all but §5 Operator Landscape, which stays market-wide).
  const routeOp = payload?.routeOperator
  const scopeText = (routeOp && section.operatorScoped)
    ? `${routeOp} on ${arrowRoute(payload?.route)} — this operator only (not the whole-route market).`
    : applyTokens(section.scope, op)

  return (
    <section className="report-section" style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)',
        margin: '4px 0 14px'
      }}>
        {section.title}
      </h2>
      {section.scope && (
        <div style={{
          display: 'inline-block', margin: '-6px 0 12px', padding: '4px 10px',
          fontSize: 12.5, lineHeight: 1.45, color: 'var(--accent-strong)',
          background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)',
          borderRadius: 6, fontWeight: 500
        }}>
          <strong style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>Scope:</strong>{' '}
          {scopeText}
        </div>
      )}
      {section.note && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: '-4px 0 14px' }}>
          {section.note}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {enabledTables.map(table => (
          <Card key={table.id} title={applyTokens(table.title, op)}>
            {table.note && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: '-8px 0 14px' }}>
                {table.note}
              </p>
            )}
            <ReportTable table={table} sectionId={section.id} payload={payload} config={config} />
          </Card>
        ))}
      </div>
    </section>
  )
}
