import Card from '../components/Card.jsx'
import ReportTable from './ReportTable.jsx'
import { tableKey } from './reportSchema.js'
import { applyTokens } from '../lib/format.js'

// Renders one report section: a heading plus a Card per enabled table.
export default function SectionBlock({ section, payload, config }) {
  const op = payload?.operator
  const enabledTables = section.tables.filter(t => config.tables[tableKey(section.id, t.id)] !== false)
  if (enabledTables.length === 0) return null

  return (
    <section className="report-section" style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)',
        margin: '4px 0 14px'
      }}>
        {section.title}
      </h2>
      {section.note && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: '-8px 0 14px' }}>
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
