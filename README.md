# Operator Report Generator

A web UI for generating customizable per-operator bus performance reports — the
same 5-section report previously hand-built (see `docs/FRESHBUS_Operator_Report_10-14Jun2026.md`),
now self-serve. Pick an operator, a date range, and exactly which sections /
tables / columns to include; preview live and export to **PDF** or **Excel**.

## Architecture

```
Browser (React + Vite)  ──/api/report*──►  Fastify proxy (server/)  ──read-only SQL──►  BigQuery MV layer
  operator/date/route pickers                 parameterized queries        drivn-project-1.dashboard_kpis._fact_trips
  section/table/column toggles                 read-only guard + maxBytes   (NEVER the raw source tables)
  live preview + PDF/XLSX export               keyed cache + gzip
```

**Data integrity & security (by design):**
- The **frontend never touches BigQuery**. It only calls `/api/report*` on the proxy.
- The proxy reads **only** the materialized-view layer — specifically the deduped
  trip-level fact `drivn-project-1.dashboard_kpis._fact_trips`. It never reads the
  raw source tables (`drivn-project-1.dunamic_window_scrapper_redbus.*`) and never writes anything.
- Every query is **parameterized** (`@operator`, `@from`, `@to`) and passes a
  **read-only guard** (only `SELECT`/`WITH`; `INSERT/UPDATE/DELETE/MERGE/DROP/...` rejected).
- `maximumBytesBilled` caps per-query scan cost; requested dates are clamped to the loaded window.
- BigQuery credentials live only on the backend (ADC locally / a read-only service
  account on Cloud Run with `bigquery.dataViewer` + `jobUser`).

## Run locally

Prereqs: Node 20+, and `gcloud auth application-default login` (ADC) with read
access to `drivn-project-1.dashboard_kpis`.

```bash
# 1. Backend (reads BigQuery)
cd server && npm install && npm run dev      # http://localhost:8788

# 2. Frontend (in another terminal)
cd .. && npm install && npm run dev          # http://localhost:5173
```

Open http://localhost:5173. Shareable links: `?operator=FRESHBUS&from=2026-06-10&to=2026-06-14`.

## Endpoints

- `GET /api/report/meta` → operators (canonical, with trip counts + routes) and the date window.
- `GET /api/report?operator=&from=&to=` → the full report payload (all 5 sections).
- `GET /api/health`

## Report conventions (match the canonical template)

- Per-day = period total ÷ distinct travel dates; trip/bus counts rounded to whole numbers.
- Occupancy = `AVG(occupancy_pct)`; Overall/Seater/Sleeper ASP from raw `price_inr`/`avg_seater_price`/`avg_sleeper_price`.
- Seater/sleeper revenue split exact from `booked_*_revenue`.
- `bus_type` → seater / sleeper / hybrid; sub-brands merged (e.g. zingbus plus + Maxx → Zingbus).
- Market = all **other** operators on the same routes the operator runs.

Verified to reproduce the FRESHBUS 10–14 Jun report exactly (77.0% / ₹15.2L / ₹553, etc.).

## Sections

1. Executive Summary · 2. Fleet Profile · 3. Revenue Dashboard (Best Routes has extra, default-off
unit-economics columns) · 4. Occupancy Analysis · 5. Competitive Benchmarking ·
**6. Cross-Operator Comparison** (pick comparison operators; subject vs them across the subject's
routes, "Not Running" where absent) · **7. Suggested Routes** (top-10 market corridors; choose
ranking criteria — revenue / occupancy / both — and a presence filter — all / operator serves /
operator absent). Modelled on `docs/IC_Report_2.md`. The two dynamic tables are built in
`src/report/views.js`.

## Optional

`sql/operator_report_views.sql` defines a `v_report_trips` view over `_fact_trips`.
It's optional — the proxy inlines the same logic, so the app works without it.

## Layout

```
server/            Fastify read-only BigQuery proxy
  bq.js            BQ client + read-only guard + parameterized runSelect
  report.js        13 parameterized queries + section builders
  index.js         endpoints, keyed cache, CORS, validation/clamping
src/
  report/          reportSchema.js (single source of truth), ControlsPanel, ReportPreview, ReportTable, exports
  components/       Dropdown, DateRangePicker, DataTable-style table, Card, Stat, ThemeToggle
  hooks/, lib/      data fetching + formatting
sql/               optional v_report_trips view
```
