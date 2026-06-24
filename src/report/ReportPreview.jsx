import Card from '../components/Card.jsx'
import SectionBlock from './SectionBlock.jsx'
import { REPORT_SCHEMA } from './reportSchema.js'
import { fmtPeriod } from '../lib/format.js'

// Right pane: the styled, customizable report. This element is the print target
// for PDF export (id="report-root").
export default function ReportPreview({ data, config, loading, error }) {
  if (error) {
    return (
      <Card style={{ borderColor: 'var(--red)' }}>
        <div style={{ color: 'var(--red)', fontWeight: 600 }}>Failed to load report</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>{error}</div>
      </Card>
    )
  }
  if (loading && !data) return <Centered>Generating report…</Centered>
  if (!data) return <Centered>Pick an operator to generate a report.</Centered>

  const nDays = data.meta?.nDays || 0
  const tripCount = data.meta?.tripCount || 0
  const enabledSections = REPORT_SCHEMA.filter(s => config.sections[s.id] !== false)

  return (
    <div id="report-root" style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* Masthead */}
      <Card className="kpi-accent" style={{ marginBottom: 24 }}>
        <div className="kpi-accent" style={{ position: 'relative', padding: '4px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Operator Level Report
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 12px' }}>
            {data.operator}
          </div>
          <table className="report-table" style={{ maxWidth: 460 }}>
            <tbody>
              <tr><td style={{ fontWeight: 700, width: 170 }}>Reporting Period</td><td>{fmtPeriod(data.meta?.from, data.meta?.to, nDays)}</td></tr>
              <tr><td style={{ fontWeight: 700 }}>Trips in Period</td><td>{tripCount.toLocaleString('en-IN')}</td></tr>
            </tbody>
          </table>
          <div style={{
            marginTop: 14, paddingLeft: 12, borderLeft: '3px solid var(--accent)',
            fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5
          }}>
            <strong>Scope:</strong> All figures are <strong>{data.operator}</strong>-specific unless a
            column/row is labelled <strong>Market</strong> / <strong>Mkt</strong>, which aggregates
            all other operators on the same route(s) {data.operator} runs.
          </div>
        </div>
      </Card>

      {tripCount === 0 && (
        <Card style={{ marginBottom: 24, borderColor: 'var(--amber)' }}>
          <div style={{ color: 'var(--amber)', fontWeight: 600 }}>No trips for this operator in the selected range.</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
            Try widening the date range or choosing a different operator.
          </div>
        </Card>
      )}

      {enabledSections.map(section => (
        <SectionBlock key={section.id} section={section} payload={data} config={config} />
      ))}

      {enabledSections.length === 0 && <Centered>All sections are hidden. Enable a section in the controls.</Centered>}
    </div>
  )
}

function Centered({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-muted)', fontSize: 16 }}>
      {children}
    </div>
  )
}
