export default function Card({ title, children, style = {}, titleRight }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 22px 20px',
      boxShadow: 'var(--shadow)',
      ...style
    }}>
      {title && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 18,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)'
        }}>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text)',
            whiteSpace: 'normal',
            lineHeight: 1.35
          }}>
            {title}
          </span>
          {titleRight && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>
              {titleRight}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
