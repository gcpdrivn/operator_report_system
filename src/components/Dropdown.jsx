import { useState, useRef, useEffect } from 'react'

export default function Dropdown({ value, options, onChange, label, searchable = true, width = 240, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = searchable && query
    ? options.filter(o => (typeof o === 'string' ? o : o.label).toLowerCase().includes(query.toLowerCase()))
    : options

  const valueLabel = (() => {
    const match = options.find(o => (typeof o === 'string' ? o : o.value) === value)
    if (!match) return value
    return typeof match === 'string' ? match : match.label
  })()

  return (
    <div ref={ref} style={{ position: 'relative', width }}>
      {label && <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <button onClick={() => !disabled && setOpen(!open)} disabled={disabled} style={{
        width: '100%', padding: '7px 12px', borderRadius: 6,
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        color: disabled ? 'var(--text-dim)' : 'var(--text)', fontSize: 15,
        textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valueLabel}</span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 }}>▾</span>
      </button>

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', maxHeight: 320, display: 'flex', flexDirection: 'column'
        }}>
          {searchable && (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" style={{
              padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 15, outline: 'none'
            }} />
          )}
          <div style={{ overflowY: 'auto', maxHeight: 280 }}>
            {filtered.map((opt, i) => {
              const optValue = typeof opt === 'string' ? opt : opt.value
              const optLabel = typeof opt === 'string' ? opt : opt.label
              const optMeta = typeof opt === 'string' ? null : opt.meta
              return (
                <div key={i} onClick={() => { onChange(optValue); setOpen(false); setQuery('') }} style={{
                  padding: '7px 12px', fontSize: 15, cursor: 'pointer',
                  background: optValue === value ? 'var(--accent-soft)' : 'transparent',
                  color: optValue === value ? 'var(--accent)' : 'var(--text)',
                  fontWeight: optValue === value ? 600 : 400,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }} onMouseEnter={e => { if (optValue !== value) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (optValue !== value) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optLabel}</span>
                  {optMeta && <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 }}>{optMeta}</span>}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 12, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
