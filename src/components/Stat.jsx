export function fmt(n, prefix = '', suffix = '') {
  if (n >= 1e7) return prefix + (n / 1e7).toFixed(1) + 'Cr' + suffix
  if (n >= 1e5) return prefix + (n / 1e5).toFixed(1) + 'L' + suffix
  if (n >= 1e3) return prefix + (n / 1e3).toFixed(1) + 'K' + suffix
  return prefix + Math.round(n).toLocaleString() + suffix
}

export default function Stat({ label, value, sub, accent, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{
        fontSize: small ? 18 : 26, fontWeight: 800, letterSpacing: '-0.02em',
        color: accent || 'var(--text)'
      }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}
