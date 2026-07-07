# Route Report — Metric Definitions

This document explains **every metric** in the Route Report: the formula/logic used to compute
it, and the source column(s) and table it is built from.

> Source of truth for the formulas: [`getRouteReport()` in server/report.js:394](../server/report.js#L394).
> Display formats: [src/lib/format.js](../src/lib/format.js). Column labels/layout:
> [src/report/routeReportSchema.js](../src/report/routeReportSchema.js).

---

## 0. Data foundations (read first)

The route report is a **market view**: unless an operator is explicitly selected, all figures
aggregate **every operator on the chosen corridor**. It draws from the same two tables as the
operator report:

| Alias in this doc | Table | What it is | Carries |
|---|---|---|---|
| **API / captured** | `dashboard_kpis._fact_trips` | The deduped **captured scrape** — one row per observed trip. | occupancy, revenue, prices, seats, distance, duration, EV flag, unique bus id |
| **Catalog / scheduled** | `dashboard_kpis.v_catalog_trips` | The **scheduled-departures spine** — one row per departure meant to run. | Identity only. **No** metrics, **no** EV flag. |

Derivation of each table, the shared `BASE` transform (route / `canon_operator` / `bus_class` /
`dep_hour` / time slot), and the display formatters are identical to the operator report — see
[METRICS_Operator_Report.md](./METRICS_Operator_Report.md) §0 for the full detail.

**The golden rule (applied everywhere):**
> **Trip / operator COUNTS come from the CATALOG (scheduled). All METRICS (occupancy, revenue, ASP, EV%, yields, unique buses) come from the API (captured).**
> Exception, called out below: the **EV vs ICE** section counts trips from the API, because the catalog carries no fuel flag.

### Scope of a route report

- Market scopes to the corridor: `route = @route AND travel_date BETWEEN @from AND @to` (`MSCOPE`),
  plus an optional `bus_class` filter.
- If an operator is selected, the *metric* sections narrow further with
  `AND canon_operator = @operator` (`RSCOPE`). The **Operator Landscape** and the operator picker
  stay **market-wide** regardless, so the competitive context is preserved.
- **Per-day** = period total ÷ `COUNT(DISTINCT travel_date)` (`n_days`).

---

## Masthead — Data Coverage disclaimer

Built in [server/report.js:536](../server/report.js#L536). Same idea as the operator report.

| Metric | Formula / logic | Source |
|---|---|---|
| **Trips Scheduled** | `COUNT(*)` on the corridor | **Catalog** |
| **Trips Captured** | `COUNT(*)` on the corridor | **API** |
| **Coverage %** | `round(100 × captured ÷ scheduled)` | catalog + API |

---

## Section 1 — Executive Summary

Three headline KPIs from [server/report.js:418](../server/report.js#L418) (`Q.exec`). Scope: whole route market.

| Metric | Formula / logic | Source column · table |
|---|---|---|
| **Avg Occupancy / Day** | `ROUND( AVG(occupancy_pct), 1)` across all trips on the route | `occupancy_pct` · **API** |
| **Avg Revenue / Day** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(DISTINCT travel_date) )` | `booked_revenue_inr`, `travel_date` · **API** |
| **Overall ASP** | Seater ASP and Sleeper ASP (see §3a) blended by booked seats: `(SeaterASP·Σseater_booked + SleeperASP·Σsleeper_booked) ÷ Σ(all booked seats)` | `booked_seater_revenue`, `booked_sleeper_revenue`, `seater_booked`, `sleeper_booked` · **API** |

---

## Section 2 — Route Profile

Scope: all operators on the route. Also from `Q.exec` ([server/report.js:418](../server/report.js#L418)); assembled in [server/report.js:561](../server/report.js#L561).

| Metric | Formula / logic | Source column · table |
|---|---|---|
| **Distance (km)** | `CAST(ROUND(ANY_VALUE(distance_km)) AS INT64)` — one-way corridor distance | `distance_km` · **API** |
| **Operators** | `COUNT(DISTINCT canon_operator)` scheduled on the route (from the route-operators list length) | `operator_name` · **Catalog** |
| **Unique Buses** | `COUNT(DISTINCT unique_bus_id)` observed | `unique_bus_id` · **API** (catalog has NULL bus id) |
| **Trips / Day** | `ROUND( scheduled trip count ÷ n_days )` | scheduled rows · **Catalog** |
| **Avg Trip Duration** | `ROUND( AVG(duration_hrs), 2)` | `duration_hrs` · **API** |
| **EV Penetration** | `ROUND( 100 × COUNTIF(is_ev = TRUE) ÷ COUNT(*), 1)` | `is_ev` · **API** |
| **Projected Monthly Rev** | `ROUND( avgRevDay × 30 )` — the daily revenue extrapolated to 30 days | derived from `booked_revenue_inr` · **API** |

---

## Section 3 — Revenue Dashboard

Scope: all operators on the route (market). Revenue / occupancy / ASP from CAPTURED (API) trips.

### 3a. Revenue Metrics at a Glance
([server/report.js:432](../server/report.js#L432), `Q.revMetrics`)

> **ASP methodology (mean of ratios).** Per trip, Seater ASP = `booked_seater_revenue ÷ seater_booked`
> and Sleeper ASP = `booked_sleeper_revenue ÷ sleeper_booked` (`SAFE_DIVIDE` → **NULL** when that class
> booked 0 seats). The route-level class ASP is the **average of those per-trip ratios, NULLs excluded** —
> so a trip that sold no sleeper seats is left out of the sleeper average entirely (it does not count as
> ₹0). **Overall ASP** is the two class ASPs **weighted by booked seats.**

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Avg Revenue / Day** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(DISTINCT travel_date) )` | `booked_revenue_inr` · **API** |
| **Seater ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` — mean of per-trip ratios, NULL-excluded | `booked_seater_revenue`, `seater_booked` · **API** |
| **Sleeper ASP** | `ROUND( AVG( SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked) ) )` — mean of per-trip ratios, NULL-excluded | `booked_sleeper_revenue`, `sleeper_booked` · **API** |
| **Overall ASP** | weighted avg of the two: `(SeaterASP·Σseater_booked + SleeperASP·Σsleeper_booked) ÷ NULLIF(Σseater_booked + Σsleeper_booked, 0)` | class revenues + booked-seat counts · **API** |

### 3b. Unit Economics
([server/report.js:439](../server/report.js#L439), `Q.unit`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Avg Revenue / Trip** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(*) )` — captured-trip denominator | `booked_revenue_inr` · **API** |
| **Avg Revenue / Km** | `ROUND( revenue_per_trip ÷ ANY_VALUE(distance_km) )` | above ÷ `distance_km` · **API** |
| **Avg Rev / Seat / Km** | `ROUND( Σ booked_revenue_inr ÷ Σ(distance_km × total_seats), 2)` | `booked_revenue_inr`, `distance_km`, `total_seats` · **API** |
| **Avg Rev / Seater / Km** | `Σ booked_seater_revenue ÷ Σ(distance_km × (seater_booked + seater_available))` | `booked_seater_revenue`, seater seat cols · **API** |
| **Avg Rev / Sleeper / Km** | `Σ booked_sleeper_revenue ÷ Σ(distance_km × (sleeper_booked + sleeper_available))` | `booked_sleeper_revenue`, sleeper seat cols · **API** |

### 3c. Seater vs Sleeper Revenue Split
([server/report.js:447](../server/report.js#L447), `Q.split`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Share** | Seater: `100 × Σ booked_seater_revenue ÷ (Σ seater + Σ sleeper)`; Sleeper: the complement | `booked_seater_revenue`, `booked_sleeper_revenue` · **API** |
| **Revenue / Day (₹L)** | `ROUND( Σ segment_revenue ÷ n_days )` | same · **API** |
| **Period (₹L)** | `ROUND( Σ segment_revenue )` | same · **API** |

---

## Section 4 — Occupancy Analysis

Scope: all operators on the route (market). Occupancy from CAPTURED (API); Trips/Day are SCHEDULED (catalog).

### 4a. Overall Occupancy Trend (daily)
([server/report.js:455](../server/report.js#L455), `Q.daily`)

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Occupancy** | `ROUND( AVG(occupancy_pct), 1)` per date | `occupancy_pct` · **API** |
| **Revenue (day)** | `ROUND( SUM(booked_revenue_inr) )` per date | `booked_revenue_inr` · **API** |
| **Avg / Day** row | appended `avgOccPct` / `revPerDay` | derived |

### 4b. Occupancy by Time of Day
([server/report.js:461](../server/report.js#L461), `Q.timeOfDay`) — 4 slots.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Avg Occupancy** | `ROUND( AVG(occupancy_pct), 1)` within slot | `occupancy_pct` (slot via `dep_hour`) · **API** |
| **Trips/Day** | `catalog trip count in slot ÷ n_days` (unrounded; "≤1" for a positive fraction) | scheduled rows · **Catalog** |

> Same scrape-window caveat as the operator report: Night/Early (00–08) under-represents 00:00–05:00.

---

## Section 5 — Operator Landscape

Scope: **broken down by operator** — the top 15 operators on the route by revenue (one row each).
Always **market-wide**, even when the report is narrowed to one operator (the selected one is flagged).
([server/report.js:474](../server/report.js#L474), `Q.operators`). Ranked by API period revenue desc.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Rank** | `ROW_NUMBER() OVER (ORDER BY period_rev DESC)` (period_rev = Σ booked_revenue_inr) | derived · **API** |
| **Operator** | `canon_operator` | `operator_name` · **API/Catalog** |
| **Trips/Day** | `catalog trips ÷ n_days` | scheduled rows · **Catalog** |
| **Occupancy** | `ROUND( AVG(occupancy_pct), 1)` per operator | `occupancy_pct` · **API** |
| **Seater ASP / Sleeper ASP** | mean of per-trip booked ratios: `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` / `…(booked_sleeper_revenue, sleeper_booked)`, NULL-excluded | `booked_seater_revenue`, `seater_booked`, `booked_sleeper_revenue`, `sleeper_booked` · **API** |
| **Revenue / Day** | `ROUND( period_rev ÷ n_days )` per operator | `booked_revenue_inr` · **API** |
| **Market Share** | `ROUND( 100 × operator_period_rev ÷ total_route_rev, 1)` | `booked_revenue_inr` · **API** |
| **Rev / Km** | `ROUND( (period_rev ÷ captured trips) ÷ ANY_VALUE(distance_km) )` | `booked_revenue_inr`, `distance_km` · **API** |
| **Rev / Seat / Km** | `Σ booked_revenue_inr ÷ Σ(distance_km × total_seats)` (2 dp) | `booked_revenue_inr`, `distance_km`, `total_seats` · **API** |
| **Rev / Seater / Km** | `Σ booked_seater_revenue ÷ Σ(distance_km × (seater_booked + seater_available))` | seater rev + seats · **API** |
| **Rev / Sleeper / Km** | `Σ booked_sleeper_revenue ÷ Σ(distance_km × (sleeper_booked + sleeper_available))` | sleeper rev + seats · **API** |

> The row also carries `coverage_pct` = `round(100 × captured ÷ scheduled)` per operator on the route.

---

## Section 6 — EV vs ICE

Scope: all operators on the route, split by fuel. **Counts here are CAPTURED (API)** — the catalog
carries no fuel flag, so the EV/ICE split can only come from the scrape.

`evPenetration` (section header) = `round(1000 × evCnt ÷ (evCnt + iceCnt)) ÷ 10`
= EV share of captured trips to 1 dp ([server/report.js:548](../server/report.js#L548)).

### 6a. EV vs ICE — Unit Economics
([server/report.js:498](../server/report.js#L498), `Q.evIce`) — one row for EV, one for ICE.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Fuel** | `IF(is_ev = TRUE, 'EV', 'ICE')` | `is_ev` · **API** |
| **Trips/Day** | `COUNT(*) ÷ n_days` for the fuel | captured rows · **API** |
| **Occupancy** | `ROUND( AVG(occupancy_pct), 1)` | `occupancy_pct` · **API** |
| **Seater ASP / Sleeper ASP** | mean of per-trip booked ratios: `ROUND( AVG( SAFE_DIVIDE(booked_seater_revenue, seater_booked) ) )` / `…(booked_sleeper_revenue, sleeper_booked)`, NULL-excluded | `booked_seater_revenue`, `seater_booked`, `booked_sleeper_revenue`, `sleeper_booked` · **API** |
| **Revenue / Trip** | `ROUND( SUM(booked_revenue_inr) ÷ COUNT(*) )` | `booked_revenue_inr` · **API** |
| **Revenue / Km** | `ROUND( revenue_per_trip ÷ ANY_VALUE(distance_km) )` | `booked_revenue_inr`, `distance_km` · **API** |
| **Rev / Seater / Km** *(off by default)* | `Σ booked_seater_revenue ÷ Σ(distance_km × (seater_booked + seater_available))` | seater rev + seats · **API** |
| **Rev / Sleeper / Km** *(off)* | `Σ booked_sleeper_revenue ÷ Σ(distance_km × (sleeper_booked + sleeper_available))` | sleeper rev + seats · **API** |

### 6b. Daily Revenue & Occupancy — EV vs ICE
([server/report.js:510](../server/report.js#L510), `Q.evIceDaily`) — per travel date.

| Metric | Formula / logic | Source · table |
|---|---|---|
| **EV Revenue** | `ROUND( SUM( IF(is_ev = TRUE, booked_revenue_inr, 0) ) )` | `is_ev`, `booked_revenue_inr` · **API** |
| **ICE Revenue** | `ROUND( SUM( IF(is_ev = FALSE, booked_revenue_inr, 0) ) )` | same · **API** |
| **EV Occ** | `ROUND( AVG( IF(is_ev = TRUE, occupancy_pct, NULL) ), 1)` | `is_ev`, `occupancy_pct` · **API** |
| **ICE Occ** | `ROUND( AVG( IF(is_ev = FALSE, occupancy_pct, NULL) ), 1)` | same · **API** |

### 6c. Fleet Composition by Fuel
([server/report.js:518](../server/report.js#L518), `Q.evIceFleet`) — one row per bus_type (top 10).

| Metric | Formula / logic | Source · table |
|---|---|---|
| **Bus Type** | raw `bus_type` string | `bus_type` · **API** |
| **EV Buses** | `COUNTIF(is_ev = TRUE)` for that bus_type | `is_ev` · **API** |
| **ICE Buses** | `COUNTIF(is_ev = FALSE)` for that bus_type | `is_ev` · **API** |

> "EV/ICE Buses" here are **trip counts** per bus_type, not distinct physical vehicles.

---

## Display formatters

Identical to the operator report — see [METRICS_Operator_Report.md](./METRICS_Operator_Report.md#display-formatters-how-raw-numbers-are-rendered).
Key tokens: `pct1` (77.0%), `rupee` (₹553), `rupee2` (₹2.15), `rupeeLakh2` (bare lakhs 2 dp),
`lakhShort` (₹15.2L / ₹1.3Cr), `hrs2` (2.35 hrs), `int`, `dash` (0/null → —), `tripsDay` (whole / ≤1 / 0).

---

### One-line summary of sources

> **Counts (trips, operators) → `v_catalog_trips` (scheduled). Metrics (occupancy, revenue, ASP, unit economics, unique buses) → `_fact_trips` (captured API).**
> **Exception:** the EV vs ICE section counts trips from the API because the catalog has no fuel flag.
> Both tables trace back to `dunamic_window_scrapper_redbus`; the proxy only reads, never writes.
