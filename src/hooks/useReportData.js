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

// Report payload for the selected operator + date range. Re-fetches when those
// change (toggles are pure client-side and never re-fetch).
export function useReportData({ operator, from, to }) {
  const [state, setState] = useState({ data: null, loading: false, error: null, fromCache: false, lastUpdated: null })
  const inFlight = useRef(false)

  const load = useCallback(async ({ force = false } = {}) => {
    if (!operator || !from || !to) return
    if (inFlight.current) return
    inFlight.current = true
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const qs = new URLSearchParams({ operator, from, to })
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
  }, [operator, from, to])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => load({ force: true }), [load])
  return { ...state, refresh }
}
