// Reusable auth gate for all Drivn frontends. Wrap the app:
//   <AuthGate appName="Dashboard">{(user, logout) => <App user={user} logout={logout} />}</AuthGate>
// Talks to drivn-server /auth/* (proxied). Handles: login, forced first-login
// password reset, self-service forgot-password, and reset-from-email-link (?token=).
// Session is an HttpOnly cookie set by the server — the browser never holds a token.
import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_BASE || ''
async function api(path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}; try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}
export const authFetch = (path, body) => api(path, body)

const C = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: "'Inter', system-ui, sans-serif" },
  card: { width: 380, maxWidth: '90vw', background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, display: 'flex', flexDirection: 'column', gap: 14 },
  logo: { fontSize: 24, fontWeight: 900, letterSpacing: '0.08em', color: '#1a1d21' },
  sub: { fontSize: 13, color: '#6b7280', marginTop: -8 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '10px 12px', borderRadius: 7, border: '1px solid #cdd2d9', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: { padding: '11px 14px', borderRadius: 7, border: 'none', background: '#5cb030', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: '#5cb030', fontSize: 13, cursor: 'pointer', padding: 0, textAlign: 'left' },
  err: { fontSize: 13, color: '#dc2626', background: 'rgba(220,38,38,0.06)', padding: '8px 10px', borderRadius: 6 },
  ok: { fontSize: 13, color: '#166534', background: 'rgba(22,101,52,0.07)', padding: '8px 10px', borderRadius: 6 },
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={C.label}>{label}</span>
      <input style={C.input} {...props} />
    </label>
  )
}

function AuthScreen({ appName, initialTicket, onAuthed }) {
  const [mode, setMode] = useState(initialTicket ? 'setpw' : 'login')  // login | setpw | forgot
  const [ticket, setTicket] = useState(initialTicket || null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [notice, setNotice] = useState(null)

  const submitLogin = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    const r = await api('/auth/login', { email, password }); setBusy(false)
    if (r.data?.mustReset) { setTicket(r.data.ticket); setMode('setpw'); setNotice('Set a new password to finish signing in.'); return }
    if (r.ok && r.data?.user) return onAuthed(r.data.user)
    setErr(r.data?.error || 'Sign-in failed.')
  }
  const submitSetPw = async (e) => {
    e.preventDefault(); setErr(null)
    if (pw1 !== pw2) return setErr('Passwords do not match.')
    setBusy(true)
    const r = await api('/auth/reset', { ticket, password: pw1 }); setBusy(false)
    if (r.ok && r.data?.user) { clearTokenFromUrl(); return onAuthed(r.data.user) }
    setErr(r.data?.error || 'Could not set password.')
  }
  const submitForgot = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    await api('/auth/forgot', { email }); setBusy(false)
    setNotice('If that email has an account, a reset link is on its way.'); setMode('login')
  }

  return (
    <div style={C.wrap}>
      <form style={C.card} onSubmit={mode === 'login' ? submitLogin : mode === 'setpw' ? submitSetPw : submitForgot}>
        <div style={C.logo}>DRIVN</div>
        <div style={C.sub}>{appName} · {mode === 'setpw' ? 'Set your password' : mode === 'forgot' ? 'Reset password' : 'Sign in'}</div>
        {notice && <div style={C.ok}>{notice}</div>}
        {err && <div style={C.err}>{err}</div>}

        {mode === 'login' && <>
          <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button style={C.btn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {/* "Forgot password?" hidden until email delivery is configured — admins reset passwords from the admin panel. */}
        </>}

        {mode === 'setpw' && <>
          <Field label="New password" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} required />
          <Field label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          <div style={{ fontSize: 11, color: '#6b7280' }}>At least 10 characters, with upper &amp; lower case and a number.</div>
          <button style={C.btn} disabled={busy}>{busy ? 'Saving…' : 'Set password &amp; continue'}</button>
        </>}

        {mode === 'forgot' && <>
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button style={C.btn} disabled={busy}>{busy ? 'Sending…' : 'Email me a reset link'}</button>
          <button type="button" style={C.link} onClick={() => { setErr(null); setMode('login') }}>← Back to sign in</button>
        </>}
      </form>
    </div>
  )
}

function clearTokenFromUrl() {
  try {
    const u = new URL(window.location.href)
    if (u.searchParams.has('token')) { u.searchParams.delete('token'); window.history.replaceState({}, '', u.pathname + (u.search || '')) }
  } catch {}
}

export function AuthGate({ appName = 'Drivn', children }) {
  const [state, setState] = useState({ user: null, loading: true })
  const check = useCallback(async () => { const r = await api('/auth/me'); setState({ user: r.ok ? r.data.user : null, loading: false }) }, [])
  useEffect(() => { check() }, [check])

  const logout = useCallback(async () => { await api('/auth/logout'); setState({ user: null, loading: false }) }, [])
  const urlToken = (() => { try { return new URLSearchParams(window.location.search).get('token') } catch { return null } })()

  if (state.loading) return <div style={{ ...C.wrap, color: '#6b7280', fontSize: 14 }}>Loading…</div>
  if (!state.user) return <AuthScreen appName={appName} initialTicket={urlToken} onAuthed={(user) => { clearTokenFromUrl(); setState({ user, loading: false }) }} />
  return typeof children === 'function' ? children(state.user, logout) : children
}
