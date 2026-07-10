# drivn-reporting

Operator/route performance **report generator** (React + Vite). Part of the Drivn
central-platform split:

- **drivn-dashboard** — network-analytics dashboard frontend
- **drivn-reporting** — this repo (report generator frontend)
- **drivn-server** — the single backend both frontends read from (metric engine + BigQuery)

## Architecture

The whole report is **data-driven from one schema** (`src/report/reportSchema.js` for
operator reports, `routeReportSchema.js` for route reports). The controls tree, the live
preview, and the PDF/XLSX exports all iterate that schema, so they never disagree.

The browser talks **only** to same-origin `/api/*`, proxied to **drivn-server** (the sole
process that touches BigQuery). All metric math lives in drivn-server's shared metric
engine. See the design docs in **drivn-server/docs/central-platform/**.

## Develop

```bash
npm install
npm run dev        # Vite dev server; proxies /api → http://localhost:8080 (drivn-server)
```

Run **drivn-server** on port 8080 alongside this.

## Build / deploy

```bash
npm run build      # → dist/
```

Deploys to Netlify (`netlify.toml`); update the `/api/*` redirect host to the deployed
drivn-server Cloud Run URL.

## Contracts consumed

`GET /api/report/meta` and `GET /api/report?type=operator|route&…` — see
**drivn-server/docs/central-platform/02-operator-report-frontend-blueprint.md**.
