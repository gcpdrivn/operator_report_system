# Operator Report — Metric Definitions

This document explains **every metric** in the Operator Report: the formula/logic used to
compute it, and the source column(s) and table it is built from.

> Source of truth for the formulas: [server/report.js](../server/report.js) (query layer +
> section builders). Display formats: [src/lib/format.js](../src/lib/format.js). Column
> labels/layout: [src/report/reportSchema.js](../src/report/reportSchema.js).

---

## 0. Data foundations (read first)

Every operator metric is built from **two tables in `drivn-project-1.dashboard_kpis`**:

| Alias in this doc | Table | What it is | Carries |
|---|---|---|---|
| **API / captured** | `_fact_trips` | The deduped **captured scrape** — one row per trip that was actually observed. | All realised metrics: occupancy, revenue, prices, seats, distance, duration, EV flag, unique bus id |
| **Catalog / scheduled** | `v_catalog_trips` | The **scheduled-departures spine** — one row per departure that was *supposed* to run. | Identity only (route, operator, bus_type, date, departure_time). **No** revenue/occupancy/EV. |

**How each table is derived**

- **`_fact_trips`** ([sql/dashboard_kpis_new.sql:59](../sql/dashboard_kpis_new.sql#L59)) reads
  `dunamic_window_scrapper_redbus.redbus_scraper_api_based` (the raw API scrape), de-duped to one
  row per `(bus_id, travel_date, departure_time)` keeping the latest scrape
  (`pull_date DESC, inserted_at DESC`). Window: `travel_date >= 2026-06-10` and `< today (IST)`.
- **`v_catalog_trips`** ([sql/operator_report_views.sql:32](../sql/operator_report_views.sql#L32)) reads
  `dunamic_window_scrapper_redbus.redbus_today_catalog`, de-duped to one row per
  `(route_source, route_destination, operator_name, bus_type, travel_date, departure_time)` keeping
  the latest `scraped_at` = one scheduled trip.

**The golden rule (applied everywhere):**
> **Trip / bus COUNTS come from the CATALOG (scheduled). All METRICS (occupancy, revenue, ASP, EV%, yields) come from the API (captured).**
> The catalog carries no realised metrics; the API is the only place a trip's revenue/occupancy exists.

### Shared derived fields (the `BASE` transform)

Computed once in the `BASE` CTE ([server/report.js:26](../server/report.js#L26)) and reused by every query:

| Field | Logic | Source column(s) |
|---|---|---|
| `route` | `CONCAT(route_source, ' -> ', route_destination)` | `route_source`, `route_destination` |
| `canon_operator` | sub-brand merge: `zingbus*` → **Zingbus**, `freshbus*` → **FRESHBUS**, else raw name | `operator_name` |
| `bus_class` | has *seater*+*sleeper* → **hybrid**; only *seater* → **seater**; only *sleeper* → **sleeper**; else **unknown** | `bus_type` (LIKE match) |
| `dep_hour` | regex-extract the hour integer from the timestamp | `departure_time` |
| time slot | `dep_hour` → **night** (00–08), **morning** (08–14), **afternoon** (14–20), **evening** (20–24) | `departure_time` |

### Scope

The whole operator report is filtered to one operator via
`canon_operator = @operator AND travel_date BETWEEN @from AND @to` (+ an optional `bus_class` filter).
"**Market**" = **all OTHER operators on the same routes the operator runs**
(`canon_operator != @operator AND route IN (operator's routes)`).

### Global conventions

- **Per-day** = period total ÷ `COUNT(DISTINCT travel_date)` (the number of travel dates in range, `n_days`).
- **Occupancy** = `AVG(occupancy_pct)` (a simple average of per-trip occupancy).
- Trip/bus counts are **rounded to whole numbers**; revenue and % keep decimals.
- `₹L` = lakhs (÷100,000); `₹Cr` = crores.

---

## Masthead — Data Coverage disclaimer

Shown once at the top of the report (not per-row). Built in [server/report.js:360](../server/report.js#L360),
rendered in [src/report/ReportPreview.jsx:53](../src/report/ReportPreview.jsx#L53).

| Metric | Formula / logic | Source |
|---|---|---|
| **Trips Scheduled** | `COUNT(*)` of the operator's rows | **Catalog** (`v_catalog_trips`) |
| **Trips Captured** | `COUNT(*)` of the operator's rows | **API** (`_fact_trips`) |
| **Coverage %** | `round(100 × captured ÷ scheduled)` | catalog + API |

*Why it exists:* a metric like Revenue/Trip is only over the **captured** subset, so the reader must
know what fraction of scheduled service was actually observed.

---

## Section 1 — Executive Summary

Three headline KPIs ([server/report.js:161](../server/report.js#L161), `Q.exec`). Scope: the operator, all trips in range.

| Metric | Formula / logic | Source column · table |
|---|---|---|
| **Avg Occupancy / Day** | `ROUND(AVG(occupancy_pct), 1)` — mean per-trip occupancy across the whole period | `occupancy_pct` · **API** |
| **Avg Revenue / Day** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(DISTINCT travel_date) )` | `booked_revenue_inr`, `travel_date` · **API** |
| **Overall ASP** | Seater & Sleeper ASP (mean of per-trip booked ratios; see §3a) blended by booked seats: `(SeaterASP·Σseater_booked + SleeperASP·Σsleeper_booked) ÷ Σ(booked seats)` | `booked_seater_revenue`, `booked_sleeper_revenue`, `seater_booked`, `sleeper_booked` · **API** |

> Note: `n_days` and all metrics here are API-based; the report's trip *count* (`trip_count`)
> in the same query is taken from the catalog subquery.

---

## Section 2 — Fleet Profile

Scope: the operator. **Counts here are SCHEDULED (catalog).**

### 2a. Fleet Composition Breakdown
Per bus-class row ([server/report.js:171](../server/report.js#L171), `Q.composition`).

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Type** | the bus class label (Seater / Sleeper / Hybrid) | `bus_class` (derived from `bus_type`) · **Catalog** |
| **Buses/Day** | `ROUND( COUNT(*) ÷ n_days )` for that class, where `n_days = COUNT(DISTINCT travel_date)` | scheduled rows · **Catalog** |
| **Routes** | `COUNT(DISTINCT route)` for that class | `route` · **Catalog** |
| **Description** | most common `bus_type` string for the class (`APPROX_TOP_COUNT(bus_type,1)`); falls back to a generic label | `bus_type` · **Catalog** |
| **Total** row | Buses/Day = `round( Σ matrix total_trips ÷ n_days )`; Routes = number of routes | derived in [buildFleet()](../server/report.js#L605) |

### 2b. Route × Departure Matrix
One row per route ([server/report.js:180](../server/report.js#L180), `Q.matrix`), ordered by total trips desc.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Seater / Sleeper / Hybrid** (per day) | `ROUND( COUNTIF(bus_class = X) ÷ n_days )` per route | `bus_class` · **Catalog** |
| **Buses/Day** | `ROUND( COUNT(*) ÷ n_days )` per route | scheduled rows · **Catalog** |
| **Total Trips (scheduled)** | exact `COUNT(*)` per route over the period | scheduled rows · **Catalog** |

> Per-day figures are rounded, so rows/columns may differ ±1 from the exact Total Trips.
> (The payload also carries `captured` and `coverage_pct` per route = API count ÷ scheduled count,
> used for the coverage tint but off by default in the table.)

---

## Section 3 — Revenue Dashboard

Scope: the operator. **All revenue/occupancy/ASP figures are from CAPTURED (API) trips.**

### 3a. Revenue Metrics at a Glance
([server/report.js:199](../server/report.js#L199), `Q.revMetrics`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Avg Revenue / Day** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(DISTINCT travel_date) )` | `booked_revenue_inr`, `travel_date` · **API** |
| **Seater ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` — mean of per-trip booked ratios, NULL-excluded | `booked_seater_revenue`, `seater_booked` · **API** |
| **Sleeper ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked) ) )` — mean of per-trip booked ratios, NULL-excluded | `booked_sleeper_revenue`, `sleeper_booked` · **API** |
| **Overall ASP** | weighted avg of the two: `(SeaterASP·Σseater_booked + SleeperASP·Σsleeper_booked) ÷ NULLIF(Σseater_booked + Σsleeper_booked, 0)` | class revenues + booked-seat counts · **API** |

> **ASP methodology (mean of ratios).** Per trip, Seater ASP = `booked_seater_revenue ÷ seater_booked`
> and Sleeper ASP = `booked_sleeper_revenue ÷ sleeper_booked` (`SAFE_DIVIDE` → **NULL** when that class
> booked 0 seats, so that trip is excluded from the class average — a no-sleeper trip is not a ₹0 data
> point). The class ASP is the **average of those per-trip ratios**; **Overall ASP** is the two class
> ASPs **weighted by booked seats.** (Switched 2026 from the legacy scraped `price_inr` /
> `avg_seater_price` / `avg_sleeper_price`, which were computed on available seats.)

### 3b. Route × Revenue Distribution
([server/report.js:206](../server/report.js#L206), `Q.distribution`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Revenue / Day (₹L)** | `ROUND( SUM(booked_revenue_inr) ÷ n_days )` per route, shown ÷100,000 | `booked_revenue_inr` · **API** |
| **Share** | `ROUND( 100 × route_period_rev ÷ SUM(period_rev) OVER() , 1)` — route's % of total operator revenue | `booked_revenue_inr` · **API** |
| **Period (₹L)** | `ROUND( SUM(booked_revenue_inr) )` per route over the whole period, shown ÷100,000 | `booked_revenue_inr` · **API** |

### 3c. Seater vs Sleeper Revenue Split
([server/report.js:214](../server/report.js#L214), `Q.split`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Share** | Seater: `100 × Σ booked_seater_revenue ÷ (Σ seater + Σ sleeper)`; Sleeper: the complement | `booked_seater_revenue`, `booked_sleeper_revenue` · **API** |
| **Revenue / Day (₹L)** | `ROUND( Σ segment_revenue ÷ n_days )` | same · **API** |
| **Period (₹L)** | `ROUND( Σ segment_revenue )` | same · **API** |

### 3d. Best Routes by Revenue per Trip
([server/report.js:222](../server/report.js#L222), `Q.bestRoutes`) — ranked by Revenue/Trip desc. All routes shown.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Rank** | `ROW_NUMBER() OVER (ORDER BY revenue_per_trip DESC)` | derived |
| **Distance (km)** | `ROUND( ANY_VALUE(distance_km) )` — one-way route distance | `distance_km` · **API** |
| **Avg Revenue / Trip** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(*) )` — **denominator = captured trips** | `booked_revenue_inr` · **API** |
| **Avg Occupancy %** | `ROUND( AVG(occupancy_pct), 1)` | `occupancy_pct` · **API** |
| **Avg Revenue / Km** | `ROUND( revenue_per_trip ÷ distance_km )` | above ÷ `distance_km` · **API** |
| **Avg Rev / Seat / Km** *(off by default)* | `ROUND( Σ booked_revenue_inr ÷ Σ(distance_km × total_seats), 2)` | `booked_revenue_inr`, `distance_km`, `total_seats` · **API** |
| **Avg Rev / Seater / Km** *(off)* | `Σ booked_seater_revenue ÷ Σ(distance_km × (seater_booked + seater_available))` | `booked_seater_revenue`, seater seat cols · **API** |
| **Avg Rev / Sleeper / Km** *(off)* | `Σ booked_sleeper_revenue ÷ Σ(distance_km × (sleeper_booked + sleeper_available))` | `booked_sleeper_revenue`, sleeper seat cols · **API** |
| **Avg Seater Price** *(off)* | `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` per route — mean of per-trip booked ratios | `booked_seater_revenue`, `seater_booked` · **API** |
| **Avg Sleeper Price** *(off)* | `ROUND( AVG( SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked) ) )` per route | `booked_sleeper_revenue`, `sleeper_booked` · **API** |

> The row also carries `coverage_pct` = `round(100 × captured ÷ scheduled)` per route (captured API
> trips ÷ scheduled catalog trips).

---

## Section 4 — Occupancy Analysis

Scope: the operator. **Occupancy from CAPTURED (API); Trips/Day are SCHEDULED (catalog).**

### 4a. Overall Occupancy Trend (daily)
([server/report.js:244](../server/report.js#L244), `Q.daily`) — one point per travel date.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Occupancy** | `ROUND( AVG(occupancy_pct), 1)` per date | `occupancy_pct` · **API** |
| **Revenue (day)** | `ROUND( SUM(booked_revenue_inr) )` per date | `booked_revenue_inr` · **API** |
| **Avg / Day** row | appended `avgOccPct` and `revPerDay` from the exec KPIs | derived |

### 4b. Occupancy by Time of Day
([server/report.js:250](../server/report.js#L250), `Q.timeOfDay`) — 4 slots (night/morning/afternoon/evening).

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Avg Occupancy** | `ROUND( AVG(occupancy_pct), 1)` within the slot | `occupancy_pct` (slot via `dep_hour`) · **API** |
| **Trips/Day** | `catalog trip count in slot ÷ n_days` (unrounded; shows "≤1" for a positive fraction) | scheduled rows (slot via `dep_hour`) · **Catalog** |

> Caveat printed in the report: the scrape window is ≈05:00–24:00 IST, so the Night/Early (00–08)
> slot under-represents 00:00–05:00 departures.

---

## Section 5 — Competitive Benchmarking

Scope: **operator vs Market**, where Market = all OTHER operators on the same routes the operator runs.

### 5a. Overall Position
([server/report.js:259](../server/report.js#L259), `Q.overall`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Occupancy** (operator & market) | `ROUND( AVG(occupancy_pct), 1)` for each side | `occupancy_pct` · **API** |
| **Seater ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` — mean of per-trip booked ratios | `booked_seater_revenue`, `seater_booked` · **API** |
| **Sleeper ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked) ) )` — mean of per-trip booked ratios | `booked_sleeper_revenue`, `sleeper_booked` · **API** |

Market side filter: `canon_operator != @operator AND route IN (operator's routes)`.

### 5b. By Route — Operator vs Market
([server/report.js:284](../server/report.js#L284), `Q.byRoute`) — one row per operator route.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **{operator} Occ** | `ROUND( AVG(occupancy_pct), 1)` for the operator on the route | `occupancy_pct` · **API** |
| **Mkt Occ** | same, for all other operators on the route | `occupancy_pct` · **API** |
| **{operator} ASP** | Overall ASP (weighted booked-seat blend of Seater & Sleeper ASP) for the operator on the route | class revenues + booked seats · **API** |
| **Mkt ASP** | same, for all other operators on the route | class revenues + booked seats · **API** |
| **Mkt P50 / P75 / P90** *(off by default)* | `APPROX_QUANTILES(occupancy_pct, 100)[OFFSET(50/75/90)]` over market trips on the route | `occupancy_pct` · **API** |

### 5c. Occupancy Percentiles (vs Market) *(optional table, off by default)*
([server/report.js:272](../server/report.js#L272), `Q.percentiles`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Mean** | `ROUND( AVG(occupancy_pct), 1)` per side (operator / market) | `occupancy_pct` · **API** |
| **P50 / P75 / P90** | `APPROX_QUANTILES(occupancy_pct, 100)[OFFSET(50/75/90)]` per side | `occupancy_pct` · **API** |

### 5d. Performance on Selected Routes (Top Operators by frequency)
([server/report.js:299](../server/report.js#L299), `Q.topOps`) — per route, top-5 by frequency + the subject.
Ranked by **scheduled trips** (catalog); metrics from API.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **rank (`rnk`)** | `ROW_NUMBER() OVER (PARTITION BY route ORDER BY trips DESC)` (trips = catalog count) | **Catalog** |
| **Trips/Day** | `catalog trips ÷ n_days` | scheduled rows · **Catalog** |
| **Occupancy** | `ROUND( AVG(occupancy_pct), 1)` per operator on the route | `occupancy_pct` · **API** |
| **Seater ASP / Sleeper ASP** | mean of per-trip booked ratios: `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` / `…(booked_sleeper_revenue, sleeper_booked)` | `booked_seater_revenue`, `seater_booked`, `booked_sleeper_revenue`, `sleeper_booked` · **API** |
| rank note | if the subject is outside the route's top 5, a note states its frequency rank | derived |

---

## Section 6 — Cross-Operator Comparison

Scope: **operator vs the specific comparison operators you pick**, head-to-head on the operator's routes.
Data query [server/report.js:321](../server/report.js#L321) (`Q.crossOps`) returns every operator on the
subject's routes; the client ([src/report/views.js:12](../src/report/views.js#L12)) builds one column-group
per selected operator. Sorted by the subject's trip frequency per route.

| Metric (per operator, toggleable) | Formula / logic | Source · table |
|---|---|---|
| **Occ** | `ROUND( AVG(occupancy_pct), 1)` for that operator on the route | `occupancy_pct` · **API** |
| **ASP** | Overall ASP — weighted booked-seat blend of Seater & Sleeper ASP (per operator per route) | class revenues + booked seats · **API** |
| **R/Trip** (Revenue/Trip) | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(*) )` (captured denominator) | `booked_revenue_inr` · **API** |
| **trips** (used for sorting / presence) | `COUNT(*)` for that operator on the route | **API** |
| "**Not Running**" | shown when the operator has no rows on that route | — |

> Note: the per-route trip *count* used here comes from the API base (`COUNT(*)` in `Q.crossOps`),
> not the catalog — it drives ordering and the "Not Running" flag, not a displayed schedule count.

---

## Section 7 — Suggested Routes

Scope: **the WHOLE MARKET** — every operator on each corridor (NOT operator-specific). Data query
[server/report.js:334](../server/report.js#L334) (`Q.suggested`); ranked & filtered client-side in
[src/report/views.js:47](../src/report/views.js#L47). Top 10 corridors by the chosen criteria.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Rank** | client-side, after sorting by criteria (revenue / occupancy / both) | derived |
| **Distance (km)** | `ROUND( ANY_VALUE(distance_km) )` | `distance_km` · **API** |
| **Mkt Rev / Day (₹L)** | `ROUND( SUM(booked_revenue_inr) ÷ n_days )` across all operators on the corridor | `booked_revenue_inr` · **API** |
| **Mkt Occ** | `ROUND( AVG(occupancy_pct), 1)` across all operators | `occupancy_pct` · **API** |
| **Trips/Day** | `catalog corridor trips ÷ n_days` | scheduled rows · **Catalog** |
| **EV Now %** | `ROUND( 100 × COUNTIF(is_ev = TRUE) ÷ COUNT(*), 1)` | `is_ev` · **API** |
| **Operators** *(off by default)* | `COUNT(DISTINCT canon_operator)` on the corridor | `operator_name` · **API** |
| **{operator}?** | `Yes/No` — does the subject run this corridor (`MAX(is_subject)`) | derived · **API** |
| **Comparison-operator presence** | `Yes/No` per selected operator, from the corridor's operator list (`ARRAY_AGG(DISTINCT canon_operator)`) | `operator_name` · **API** |

**Client-side ranking score** ([src/report/views.js:59](../src/report/views.js#L59)):
- `revenue` → `mktRevDay`
- `occupancy` → `mktOcc`
- `both` → `0.5 × (mktRevDay ÷ maxRev) + 0.5 × (mktOcc ÷ 100)`

Presence filter: `serves` keeps corridors the subject runs; `absent` keeps the rest.

---

## Display formatters (how raw numbers are rendered)

From [src/lib/format.js](../src/lib/format.js):

| Token | Rendering | Used for |
|---|---|---|
| `pct1` | one-decimal % (`77.0%`) | occupancy, shares |
| `rupee` | `₹` + Indian-grouped integer (`₹553`) | ASP, rev/trip, rev/km |
| `rupee2` | `₹` + 2 dp (`₹2.15`) | small per-km yields |
| `rupeeLakh2` | bare lakhs, 2 dp (value ÷ 1e5) | revenue distribution / split |
| `lakhShort` | short form `₹15.2L` / `₹1.3Cr` | KPI revenue |
| `int` | Indian-grouped integer | counts |
| `dash` | integer, but `0`/null → `—` | matrix cells, distance |
| `tripsDay` | whole number, or `≤1` for a positive fraction, else `0` | trips/day |

---

### One-line summary of sources

> **Counts (trips, buses/day) → `v_catalog_trips` (scheduled).**
> **Everything else (occupancy, revenue, ASP, EV%, yields, percentiles) → `_fact_trips` (captured API scrape).**
> Both trace back to the raw scrape tables in `dunamic_window_scrapper_redbus`; the report proxy only ever reads, never writes.
