import Card from '../components/Card.jsx'
import SectionBlock from './SectionBlock.jsx'
import { fmtPeriod } from '../lib/format.js'

const CLASS_LABEL = { seater: 'Seater', sleeper: 'Sleeper', hybrid: 'Hybrid (seater + sleeper)' }

// Right pane: the styled, customizable report. This element is the print target
// for PDF export (id="report-root"). `schema` is the active report-type schema.
export default function ReportPreview({ data, config, schema, loading, error }) {
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
  const isRoute = config.reportType === 'route'
  const subject = isRoute ? (data.route || '').replace(' -> ', ' → ') : data.operator
  const enabledSections = schema.filter(s => config.sections[s.id] !== false)

  return (
    <div id="report-root" style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* Masthead */}
      <Card className="kpi-accent" style={{ marginBottom: 24 }}>
        <div className="kpi-accent" style={{ position: 'relative', padding: '4px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            {isRoute ? 'Route Level Report' : 'Operator Level Report'}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 4px' }}>
            {subject}
          </div>
          {((isRoute && data.routeOperator) || data.busClass) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
              {isRoute && data.routeOperator && (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 6 }}>
                  Operator focus: {data.routeOperator}
                </span>
              )}
              {data.busClass && (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 6 }}>
                  Bus class: {CLASS_LABEL[data.busClass] || data.busClass} only
                </span>
              )}
            </div>
          ) : <div style={{ height: 8 }} />}
          {(() => {
            const sched = data.meta?.tripsScheduled ?? tripCount
            const captured = data.meta?.tripsCaptured
            const cov = data.meta?.coveragePct
            return (
              <table className="report-table" style={{ maxWidth: 520 }}>
                <tbody>
                  <tr><td style={{ fontWeight: 700, width: 190 }}>Reporting Period</td><td>{fmtPeriod(data.meta?.from, data.meta?.to, nDays)}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>Trips Scheduled (catalog)</td><td>{sched.toLocaleString('en-IN')}</td></tr>
                  {captured != null && (
                    <tr><td style={{ fontWeight: 700 }}>Trips Captured (scraped)</td>
                      <td>{captured.toLocaleString('en-IN')}{cov != null && <> · <strong style={{ color: cov >= 90 ? 'var(--accent-strong)' : 'var(--amber)' }}>{cov}% coverage</strong></>}</td></tr>
                  )}
                </tbody>
              </table>
            )
          })()}
          <div style={{
            marginTop: 14, paddingLeft: 12, borderLeft: '3px solid var(--accent)',
            fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55
          }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Data coverage:</strong> trip <em>counts</em> (Trips, Trips/Day, Buses/Day) are the full <strong>scheduled</strong> timetable
              from the catalog. Revenue, occupancy & ASP are computed from the <strong>captured</strong> trips only
              {data.meta?.coveragePct != null && <> — <strong>{data.meta.coveragePct}%</strong> of scheduled departures were captured in this report</>}.
            </div>
            {data.busClass && (
              <div style={{ marginBottom: 6 }}>
                <strong>Bus-class filter:</strong> every figure below (including any market comparison) is restricted to
                {' '}<strong>{CLASS_LABEL[data.busClass] || data.busClass}</strong> buses only. Clear the filter to see all bus types.
              </div>
            )}
            {isRoute ? (
              data.routeOperator ? (
                <><strong>Scope:</strong> sections 1–4 &amp; 6 are filtered to <strong>{data.routeOperator}</strong> on <strong>{subject}</strong> (this
                operator only). §5 Operator Landscape still lists <strong>all operators</strong> on the route, with {data.routeOperator} highlighted.</>
              ) : (
                <><strong>Scope:</strong> all figures aggregate <strong>all operators</strong> on <strong>{subject}</strong> (the route market).
                §5 Operator Landscape breaks it down per operator; §6 splits by fuel.</>
              )
            ) : (
              <><strong>Scope:</strong> figures are <strong>{subject}</strong>-specific unless a column/row is labelled
              <strong> Market / Mkt</strong> (= all OTHER operators on {subject}’s routes). §6 compares {subject} with operators you pick;
              §7 covers the whole market. Each section is labelled with its scope.</>
            )}
          </div>
        </div>
      </Card>

      {tripCount === 0 && (
        <Card style={{ marginBottom: 24, borderColor: 'var(--amber)' }}>
          <div style={{ color: 'var(--amber)', fontWeight: 600 }}>
            No {data.busClass ? `${CLASS_LABEL[data.busClass] || data.busClass} ` : ''}trips for this {isRoute ? 'route' : 'operator'}
            {isRoute && data.routeOperator ? ` (operator ${data.routeOperator})` : ''} in the selected range.
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
            {data.busClass
              ? <>This {isRoute ? 'corridor' : 'operator'} may run no <strong>{CLASS_LABEL[data.busClass] || data.busClass}</strong> buses here — try “All” bus classes, a wider date range, or a different {isRoute ? 'route' : 'operator'}.</>
              : <>Try widening the date range or choosing a different {isRoute ? 'route' : 'operator'}.</>}
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
