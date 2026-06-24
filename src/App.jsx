import { useState, useEffect, useRef } from 'react'
import ThemeToggle, { applyTheme, getInitialTheme } from './components/ThemeToggle.jsx'
import ControlsPanel from './report/ControlsPanel.jsx'
import ReportPreview from './report/ReportPreview.jsx'
import { useReportMeta, useReportData } from './hooks/useReportData.js'
import { buildDefaultConfig } from './report/defaultConfig.js'
import { exportPdf } from './report/export/exportPdf.js'
import { exportXlsx } from './report/export/exportXlsx.js'

export default function App() {
  useEffect(() => { applyTheme(getInitialTheme()) }, [])

  const { meta, loading: metaLoading, error: metaError } = useReportMeta()
  const [config, setConfig] = useState(null)

  // Seed the config once meta arrives. Optional ?operator=&from=&to= URL params
  // pre-select a report (shareable links), validated against the loaded window.
  useEffect(() => {
    if (!meta || config) return
    const base = buildDefaultConfig(meta)
    const p = new URLSearchParams(window.location.search)
    const op = p.get('operator')
    const from = p.get('from')
    const to = p.get('to')
    const dates = meta.window?.dates || []
    if (op && meta.operators?.some(o => o.name === op)) base.operator = op
    if (from && dates.includes(from)) base.from = from
    if (to && dates.includes(to)) base.to = to
    setConfig(base)
  }, [meta, config])

  const { data, loading, error, fromCache, refresh } = useReportData({
    operator: config?.operator, from: config?.from, to: config?.to,
  })

  // Once a report loads, seed the competitive routes (top 2 of the operator's
  // in-range routes) and comparison operators (top 2 by trips) — once per
  // operator. The user can change them freely afterward.
  const initFor = useRef(null)
  useEffect(() => {
    if (!config || !data) return
    if (data.operator !== config.operator) return        // ignore stale data from a previous operator
    if (initFor.current === config.operator) return
    initFor.current = config.operator
    const routeTop2 = (data.meta?.routes || []).slice(0, 2)
    const compTop2 = (data.crossOperator?.operatorOptions || []).slice(0, 2).map(o => o.name)
    setConfig(c => ({ ...c, competitiveRoutes: routeTop2, comparisonOperators: compTop2 }))
  }, [data, config])

  const ready = !!(config && data)
  const handlePdf = () => exportPdf(`Operator_Report_${config?.operator}_${config?.from}_${config?.to}`)
  const handleXlsx = () => { if (ready) exportXlsx(config, data) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 60, borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
        boxShadow: 'var(--shadow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.08em', color: 'var(--text)' }}>DRIVN</span>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600 }}>Operator Report Generator</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {fromCache && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>cached</span>}
          <ActionBtn onClick={handleXlsx} disabled={!ready}>↧ Excel</ActionBtn>
          <ActionBtn onClick={handlePdf} disabled={!ready} primary>↧ PDF</ActionBtn>
          <ActionBtn onClick={refresh} disabled={loading || !config} title="Refresh from BigQuery">{loading ? '…' : '↻'}</ActionBtn>
          <ThemeToggle />
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside className="controls" style={{
          width: 340, flexShrink: 0, overflowY: 'auto', padding: 18,
          borderRight: '1px solid var(--border)', background: 'var(--surface)'
        }}>
          {metaLoading && <Muted>Loading operators…</Muted>}
          {metaError && <Err>{metaError}</Err>}
          {config && meta && <ControlsPanel meta={meta} config={config} setConfig={setConfig} data={data} />}
        </aside>

        <main className="preview" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}>
          {config
            ? <ReportPreview data={data} config={config} loading={loading} error={error} />
            : <Muted>Initializing…</Muted>}
        </main>
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, disabled, primary, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      padding: '7px 14px', borderRadius: 6, fontSize: 14, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: primary ? 'none' : '1px solid var(--border-strong)',
      background: primary ? 'var(--accent)' : 'var(--surface)',
      color: primary ? '#fff' : 'var(--text-muted)',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.15s'
    }}>{children}</button>
  )
}
function Muted({ children }) { return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{children}</div> }
function Err({ children }) { return <div style={{ color: 'var(--red)', fontSize: 14 }}>{children}</div> }
