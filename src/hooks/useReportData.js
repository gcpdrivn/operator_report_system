import { useState, useEffect, useRef, useCallback } from 'react'

// Empty in dev (Vite proxies /api to the local report proxy on :8788, the only
// thing that touches BigQuery). Set VITE_API_BASE at build time for prod.
const API_BASE = import.meta.env.VITE_API_BASE || ''

// Meta drives the pickers (operators, date window, per-operator routes). Loaded once.
export function useReportMeta() {
  const [state, setState] = useState({ meta: null, loading: true, error: null })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/report/meta`)
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`Meta ${res.status}: ${body || res.statusText}`)
        }
        const meta = await res.json()
        if (alive) setState({ meta, loading: false, error: null })
      } catch (e) {
        if (alive) setState({ meta: null, loading: false, error: e?.message || String(e) })
      }
    })()
    return () => { alive = false }
  }, [])

  return state
}

// Report payload for the selected subject (operator or route) + date range.
// Re-fetches when type/operator/route/dates change (toggles are client-side).
export function useReportData({ type = 'operator', operator, route, from, to }) {
  const [state, setState] = useState({ data: null, loading: false, error: null, fromCache: false, lastUpdated: null })
  const inFlight = useRef(false)

  const subject = type === 'route' ? route : operator

  const load = useCallback(async ({ force = false } = {}) => {
    if (!subject || !from || !to) return
    if (inFlight.current) return
    inFlight.current = true
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const qs = new URLSearchParams({ from, to })
      if (type === 'route') { qs.set('type', 'route'); qs.set('route', route) }
      else { qs.set('operator', operator) }
      if (force) qs.set('refresh', '1')
      const res = await fetch(`${API_BASE}/api/report?${qs.toString()}`)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Report ${res.status}: ${body || res.statusText}`)
      }
      const data = await res.json()
      setState({
        data,
        loading: false,
        error: null,
        fromCache: res.headers.get('x-cache') === 'HIT',
        lastUpdated: new Date(),
      })
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e?.message || String(e) }))
    } finally {
      inFlight.current = false
    }
  }, [type, operator, route, from, to, subject])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => load({ force: true }), [load])
  return { ...state, refresh }
}
