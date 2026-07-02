import { fmtDate, FORMATTERS } from '../lib/format.js'

// Lightweight, dependency-free, print-friendly line chart (inline SVG).
// Used for the daily occupancy trend. Y-axis fixed 0–100% (occupancy).
//   rows:   [{ [xKey]: 'YYYY-MM-DD', <seriesKey>: number, isTotal? }]
//   series: [{ key, label, color, format }]
export default function LineChart({ rows, xKey = 'date', series = [], height = 260 }) {
  const data = (rows || []).filter(r => !r.isTotal)
  if (data.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0' }}>No data to plot.</div>
  }

  const W = 760, H = 300, m = { l: 46, r: 18, t: 22, b: 38 }
  const pw = W - m.l - m.r, ph = H - m.t - m.b
  const yMin = 0, yMax = 100
  const n = data.length
  const showLabels = n <= 8
  const xOf = i => m.l + (n === 1 ? pw / 2 : (pw * i) / (n - 1))
  const yOf = v => m.t + ph * (1 - (Math.max(yMin, Math.min(yMax, Number(v) || 0)) - yMin) / (yMax - yMin))
  const yTicks = [0, 25, 50, 75, 100]

  return (
    <div className="rt-scroll" style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height, display: 'block', minWidth: 360 }} role="img" aria-label="Occupancy trend line chart">
        {/* y gridlines + labels (0% is a solid baseline) */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={m.l} y1={yOf(t)} x2={W - m.r} y2={yOf(t)}
              stroke={t === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeWidth="1" strokeDasharray={t === 0 ? '0' : '3 4'} />
            <text x={m.l - 8} y={yOf(t) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">{t}%</text>
          </g>
        ))}
        {/* x labels (dates) — thinned to ≤8, edge labels anchored inward, with ticks */}
        {data.map((d, i) => {
          const step = Math.max(1, Math.ceil(n / 8))
          if (!(i === 0 || i === n - 1 || i % step === 0)) return null
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          return (
            <g key={i}>
              <line x1={xOf(i)} y1={yOf(0)} x2={xOf(i)} y2={yOf(0) + 5} stroke="var(--border-strong)" strokeWidth="1" />
              <text x={xOf(i)} y={H - m.b + 20} textAnchor={anchor} fontSize="12" fill="var(--text-muted)">{fmtDate(d[xKey])}</text>
            </g>
          )
        })}
        {/* series */}
        {series.map(s => {
          const color = s.color || 'var(--accent-strong)'
          const pts = data.map((d, i) => `${xOf(i)},${yOf(d[s.key])}`).join(' ')
          const fmt = FORMATTERS[s.format] || FORMATTERS.pct1
          return (
            <g key={s.key}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((d, i) => {
                const v = d[s.key]
                if (v == null) return null
                return (
                  <g key={i}>
                    <circle cx={xOf(i)} cy={yOf(v)} r="3.5" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
                    {showLabels && (
                      <text x={xOf(i)} y={yOf(v) - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{fmt(v)}</text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
