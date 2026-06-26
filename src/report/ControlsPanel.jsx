import { useState, useRef, useEffect } from 'react'
import Dropdown from '../components/Dropdown.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import { tableKey } from './reportSchema.js'
import { SCHEMAS } from './schemas.js'
import { operatorRoutes } from './defaultConfig.js'
import { applyTokens } from '../lib/format.js'

const arrow = r => String(r).replace(' -> ', ' → ')
const sectionLabel = { groupTitle: { fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, margin: '18px 0 8px' } }

export default function ControlsPanel({ meta, config, setConfig, data, schema }) {
  const [expanded, setExpanded] = useState(() => new Set(Object.values(SCHEMAS).flat().map(s => s.id)))
  const [expandedCols, setExpandedCols] = useState(() => new Set())
  const isRoute = config.reportType === 'route'

  const dates = meta?.window?.dates || []
  const startIdx = Math.max(0, dates.indexOf(config.from))
  const endIdx = dates.indexOf(config.to) >= 0 ? dates.indexOf(config.to) : dates.length - 1

  const setOperator = (name) =>
    // Clear route/operator picks; App re-seeds them from the new operator's data.
    setConfig(c => ({ ...c, operator: name, competitiveRoutes: [], comparisonOperators: [] }))
  const setStartIdx = (i) => setConfig(c => ({ ...c, from: dates[i] || c.from }))
  const setEndIdx = (i) => setConfig(c => ({ ...c, to: dates[i] || c.to }))
  const toggleSection = (id) => setConfig(c => ({ ...c, sections: { ...c.sections, [id]: !c.sections[id] } }))
  const toggleTable = (k) => setConfig(c => ({ ...c, tables: { ...c.tables, [k]: c.tables[k] === false } }))
  const toggleColumn = (k, col) => setConfig(c => ({
    ...c, columns: { ...c.columns, [k]: { ...c.columns[k], [col]: c.columns[k]?.[col] === false } }
  }))
  const setRoute = (idx, route) => setConfig(c => {
    const next = [...(c.competitiveRoutes || [])]
    next[idx] = route
    return { ...c, competitiveRoutes: next }
  })
  const setComparison = (idx, opName) => setConfig(c => {
    const arr = [...(c.comparisonOperators || [])]
    if (opName) arr[idx] = opName; else arr.splice(idx, 1)
    return { ...c, comparisonOperators: arr.filter((v, i, a) => v && a.indexOf(v) === i) }
  })
  const setField = (key, val) => setConfig(c => ({ ...c, [key]: val }))

  // In-range routes come from the loaded report; fall back to the full-window
  // route list from meta before data arrives.
  const routes = (data?.meta?.routes && data.meta.routes.length)
    ? data.meta.routes
    : operatorRoutes(meta, config.operator)
  const routeOptions = routes.map(r => ({ value: r, label: arrow(r) }))
  const operatorOptions = (meta?.operators || []).map(o => ({ value: o.name, label: o.name, meta: `${o.trips}` }))
  // All routes in the window — the subject picker for route-level reports.
  const allRouteOptions = (meta?.routes || []).map(r => ({ value: r.route, label: arrow(r.route), meta: `${r.trips}` }))

  const toggleSet = (setter, key) => setter(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const competitiveOn = config.sections.competitive &&
    config.tables[tableKey('competitive', 'topOperators')] !== false

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Report Controls</div>

      <div style={sectionLabel.groupTitle}>Report Type</div>
      <Segmented value={config.reportType} onChange={v => setField('reportType', v)}
        options={[{ v: 'operator', l: 'Operator' }, { v: 'route', l: 'Route' }]} />

      {isRoute ? (
        <>
          <div style={sectionLabel.groupTitle}>Route</div>
          <Dropdown value={config.route} options={allRouteOptions} onChange={r => setField('route', r)} width="100%" />
        </>
      ) : (
        <>
          <div style={sectionLabel.groupTitle}>Operator</div>
          <Dropdown value={config.operator} options={operatorOptions} onChange={setOperator} width="100%" />
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <DateRangePicker dates={dates} startIdx={startIdx} endIdx={endIdx} setStartIdx={setStartIdx} setEndIdx={setEndIdx} />
      </div>

      {!isRoute && competitiveOn && (
        <>
          <div style={sectionLabel.groupTitle}>Competitive Routes (top-operator tables)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1].map(i => (
              <Dropdown key={i} value={config.competitiveRoutes?.[i] || ''} options={routeOptions}
                onChange={r => setRoute(i, r)} width="100%" />
            ))}
          </div>
        </>
      )}

      {!isRoute && (config.sections.crossOperator || config.sections.suggested) && (
        <>
          <div style={sectionLabel.groupTitle}>Comparison Operators (§6 / §7)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => {
              const opts = [{ value: '', label: '(none)' },
                ...((data?.crossOperator?.operatorOptions) || []).map(o => ({ value: o.name, label: o.name, meta: String(o.trips) }))]
              return (
                <Dropdown key={i} value={(config.comparisonOperators || [])[i] || ''} options={opts}
                  onChange={v => setComparison(i, v)} width="100%" />
              )
            })}
          </div>
        </>
      )}

      {!isRoute && config.sections.suggested && config.tables[tableKey('suggested', 'topRoutes')] !== false && (
        <>
          <div style={sectionLabel.groupTitle}>Suggested Routes — Ranking Criteria</div>
          <Segmented value={config.suggestedCriteria} onChange={v => setField('suggestedCriteria', v)}
            options={[{ v: 'revenue', l: 'Revenue' }, { v: 'occupancy', l: 'Occupancy' }, { v: 'both', l: 'Both' }]} />
          <div style={{ ...sectionLabel.groupTitle, marginTop: 12 }}>Suggested Routes — Show</div>
          <Segmented value={config.suggestedPresence} onChange={v => setField('suggestedPresence', v)}
            options={[{ v: 'all', l: 'All' }, { v: 'serves', l: 'Operator serves' }, { v: 'absent', l: 'Operator absent' }]} />
        </>
      )}

      <div style={sectionLabel.groupTitle}>Sections · Tables · Columns</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {schema.map(section => {
          const tableKeys = section.tables.map(t => tableKey(section.id, t.id))
          const onCount = tableKeys.filter(k => config.tables[k] !== false).length
          const secOn = config.sections[section.id] !== false
          const indeterminate = secOn && onCount > 0 && onCount < tableKeys.length
          const isExp = expanded.has(section.id)
          return (
            <div key={section.id}>
              <Row depth={0}>
                <Caret open={isExp} onClick={() => toggleSet(setExpanded, section.id)} />
                <Check checked={secOn && onCount === tableKeys.length} indeterminate={indeterminate}
                  onChange={() => toggleSection(section.id)} />
                <Label strong onClick={() => toggleSection(section.id)}>{section.title}</Label>
              </Row>
              {isExp && section.tables.map(table => {
                const k = tableKey(section.id, table.id)
                const tableOn = config.tables[k] !== false
                const cols = config.columns[k] || {}
                const colsOn = table.columns.filter(c => cols[c.key] !== false).length
                const colsExp = expandedCols.has(k)
                return (
                  <div key={table.id}>
                    <Row depth={1}>
                      <Caret open={colsExp} onClick={() => toggleSet(setExpandedCols, k)} />
                      <Check checked={tableOn} disabled={!secOn} onChange={() => toggleTable(k)} />
                      <Label dim={!secOn} onClick={() => secOn && toggleTable(k)}>{applyTokens(table.title, config.operator)}</Label>
                    </Row>
                    {colsExp && (
                      <div>
                        {table.columns.map(c => (
                          <Row key={c.key} depth={2}>
                            <Check checked={cols[c.key] !== false} disabled={!secOn || !tableOn}
                              onChange={() => toggleColumn(k, c.key)} />
                            <Label dim={!secOn || !tableOn} small onClick={() => secOn && tableOn && toggleColumn(k, c.key)}>
                              {applyTokens(c.label, config.operator)}
                            </Label>
                          </Row>
                        ))}
                        <Row depth={2}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{colsOn}/{table.columns.length} columns shown</span></Row>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ depth = 0, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 0', paddingLeft: depth * 18
    }}>{children}</div>
  )
}

function Caret({ open, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 16, height: 16, border: 'none', background: 'transparent', cursor: 'pointer',
      color: 'var(--text-muted)', fontSize: 11, lineHeight: 1, padding: 0, flexShrink: 0
    }}>{open ? '▾' : '▸'}</button>
  )
}

function Check({ checked, indeterminate, disabled, onChange }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={!!checked} disabled={disabled} onChange={onChange}
      style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }} />
  )
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: '5px 6px', fontSize: 13, fontWeight: 600,
          background: value === o.v ? 'var(--accent)' : 'transparent',
          color: value === o.v ? '#fff' : 'var(--text-muted)',
          border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap'
        }}>{o.l}</button>
      ))}
    </div>
  )
}

function Label({ children, strong, dim, small, onClick }) {
  return (
    <span onClick={onClick} style={{
      fontSize: small ? 13 : 14, fontWeight: strong ? 700 : 500,
      color: dim ? 'var(--text-dim)' : 'var(--text)', cursor: onClick ? 'pointer' : 'default',
      userSelect: 'none', lineHeight: 1.3
    }}>{children}</span>
  )
}
