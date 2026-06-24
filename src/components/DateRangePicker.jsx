/**
 * Inline date-range picker for the report builder. Operates on indices into a
 * sorted list of available "YYYY-MM-DD" strings (the MV rolling window). Reports
 * are always per-day, so there is no granularity control.
 *
 * Props:
 *   dates: string[]          — sorted available dates (inclusive bounds)
 *   startIdx, endIdx         — indices into `dates`
 *   setStartIdx, setEndIdx
 */
export default function DateRangePicker({ dates, startIdx, endIdx, setStartIdx, setEndIdx }) {
  const minDate = dates[0] || ''
  const maxDate = dates[dates.length - 1] || ''
  const startStr = dates[startIdx] || minDate
  const endStr = dates[endIdx] || maxDate
  const dayCount = dates.length ? (endIdx - startIdx + 1) : 0

  function onStartChange(e) {
    const idx = dates.indexOf(e.target.value)
    if (idx >= 0) setStartIdx(Math.min(idx, endIdx))
  }
  function onEndChange(e) {
    const idx = dates.indexOf(e.target.value)
    if (idx >= 0) setEndIdx(Math.max(idx, startIdx))
  }
  function quick(rangeDays) {
    const last = dates.length - 1
    setStartIdx(Math.max(0, last - rangeDays + 1))
    setEndIdx(last)
  }
  function resetAll() { setStartIdx(0); setEndIdx(dates.length - 1) }

  const labelStyle = { fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={labelStyle}>Date Range</span>
        <span style={{
          fontSize: 13, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: 'var(--accent-soft)', color: 'var(--accent)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>{dayCount}d</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={labelStyle}>From</div>
          <input type="date" value={startStr} min={minDate} max={endStr} onChange={onStartChange} style={{ width: '100%' }} />
        </div>
        <div>
          <div style={labelStyle}>To</div>
          <input type="date" value={endStr} min={startStr} max={maxDate} onChange={onEndChange} style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {[{ l: 'Last 7d', d: 7 }, { l: 'Last 14d', d: 14 }, { l: 'Last 30d', d: 30 }].map(q => (
          <button key={q.l} onClick={() => quick(q.d)} style={presetBtn}>{q.l}</button>
        ))}
        <button onClick={resetAll} style={{ ...presetBtn, color: 'var(--accent)', borderColor: 'var(--accent-soft)' }}>All</button>
      </div>
    </div>
  )
}

const presetBtn = {
  padding: '4px 10px', fontSize: 13, fontWeight: 600,
  background: 'var(--surface2)', color: 'var(--text-muted)',
  border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer'
}
