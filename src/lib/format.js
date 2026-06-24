import { fmt } from '../components/Stat.jsx'

const inr = n => Math.round(Number(n)).toLocaleString('en-IN')

// Format tokens — the single mapping reused by the preview AND the XLSX export,
// so on-screen text and Excel text always agree. Each receives (value, row);
// `auto` defers to the per-row `format` field (used by mixed-unit tables).
export const FORMATTERS = {
  text:       v => (v == null ? '' : String(v)),
  int:        v => (v == null ? '—' : inr(v)),
  dash:       v => (v == null || v === 0 ? '—' : inr(v)),       // 0 / null render as em-dash
  pct1:       v => (v == null ? '—' : `${Number(v).toFixed(1)}%`),
  share1:     v => (v == null ? '—' : `${Number(v).toFixed(1)}%`),
  rupee:      v => (v == null ? '—' : `₹${inr(v)}`),
  rupee2:     v => (v == null ? '—' : `₹${Number(v).toFixed(2)}`),     // small per-km figures
  rupeeLakh2: v => (v == null ? '—' : (Number(v) / 1e5).toFixed(2)),   // bare lakhs, 2 dp
  lakh2:      v => (v == null ? '—' : `₹${(Number(v) / 1e5).toFixed(2)}L`),
  lakhShort:  v => (v == null ? '—' : fmt(Number(v), '₹')),            // ₹15.2L / ₹1.3Cr
  date:       v => fmtDate(v),                                          // 'YYYY-MM-DD' -> '10 Jun'
  auto:       (v, row) => (FORMATTERS[row?.format] || FORMATTERS.text)(v, row),
}

// Replace {operator} in schema labels/titles with the actual operator name.
export const applyTokens = (s, operator) => String(s).replace(/\{operator\}/g, operator || 'Operator')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' -> '10 Jun' for the daily-trend rows and the report header.
export function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]}`
}

// '10 Jun – 14 Jun 2026 (5 travel dates)'
export function fmtPeriod(from, to, nDays) {
  const y = String(to).split('-')[0]
  const tail = nDays ? ` (${nDays} travel date${nDays === 1 ? '' : 's'})` : ''
  return `${fmtDate(from)} – ${fmtDate(to)} ${y}${tail}`
}
