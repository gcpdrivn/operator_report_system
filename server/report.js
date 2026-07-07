// Operator Report Generator — query layer + section builders.
//
// Reads ONLY drivn-project-1.dashboard_kpis._fact_trips (the deduped trip-level
// MV). Never the raw source tables. Every query is parameterized (@operator,
// @from, @to) and runs through the read-only guard in bq.js.
//
// Formula conventions follow the canonical operator report (verified to
// reproduce the FRESHBUS 10–14 Jun report exactly):
//   - per-day = period total / COUNT(DISTINCT travel_date)
//   - occupancy = AVG(occupancy_pct)
//   - Seater/Sleeper ASP = AVG of per-trip booked ratios (rev/booked seats), NULL when
//     that class booked 0 seats; Overall ASP = those two ASPs weighted by booked seats
//   - seater/sleeper revenue split exact from booked_*_revenue
//   - trip/bus counts rounded to whole numbers
//   - bus_class: seater-only / sleeper-only / both = hybrid
//   - sub-brands merged via canon_operator
//   - market = ALL OTHER operators on the SAME routes the operator runs

import { runSelect } from './bq.js'

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'drivn-project-1'
const KPI_DATASET = process.env.BQ_KPI_DATASET_FQ || `${PROJECT}.dashboard_kpis`
const FACT = `\`${KPI_DATASET}._fact_trips\``

// Shared base: derive route / canonical operator / bus class / departure hour
// inline so the app is self-contained (no view-creation step required).
const BASE = `
  SELECT
    travel_date,
    CONCAT(route_source, ' -> ', route_destination) AS route,
    route_source AS src, route_destination AS dst,
    operator_name,
    CASE
      WHEN LOWER(operator_name) LIKE 'zingbus%'  THEN 'Zingbus'
      WHEN LOWER(operator_name) LIKE 'freshbus%' THEN 'FRESHBUS'
      ELSE operator_name END AS canon_operator,
    bus_type,
    CASE
      WHEN LOWER(bus_type) LIKE '%seater%' AND LOWER(bus_type) LIKE '%sleeper%' THEN 'hybrid'
      WHEN LOWER(bus_type) LIKE '%seater%'  THEN 'seater'
      WHEN LOWER(bus_type) LIKE '%sleeper%' THEN 'sleeper'
      ELSE 'unknown' END AS bus_class,
    SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\\d{1,2}):') AS INT64) AS dep_hour,
    distance_km, duration_hrs, occupancy_pct, price_inr, avg_seater_price, avg_sleeper_price,
    booked_seater_revenue, booked_sleeper_revenue, booked_revenue_inr,
    total_seats, seater_booked, seater_available, sleeper_booked, sleeper_available,
    is_ev, bus_id, unique_bus_id
  FROM ${FACT}
`

// Catalog trip-count source — the scheduled-departures spine, deduped, in the
// MV layer (drivn-project-1.dashboard_kpis.v_catalog_trips). Trip COUNTS come
// from here (the schedule); metrics (occupancy/revenue/ASP) stay from _fact_trips
// (the captured scrape), since the catalog carries no realised metrics.
const CATALOG = process.env.BQ_CATALOG_FQ || `${KPI_DATASET}.v_catalog_trips`
const CAT = `\`${CATALOG}\``

// Dates are bound as STRING params and DATE()-cast in SQL. The BigQuery Node
// client mis-binds a plain string to a DATE-typed param (matches nothing), so
// we avoid declaring DATE on the param and cast inside the query instead.
const OP = 'canon_operator = @operator AND travel_date BETWEEN DATE(@from) AND DATE(@to)'
const RANGE = 'travel_date BETWEEN DATE(@from) AND DATE(@to)'
const TYPES = { operator: 'STRING', from: 'STRING', to: 'STRING' }

// Optional bus-class filter (both report types). '' = all bus types.
const CLASSES = new Set(['seater', 'sleeper', 'hybrid'])
const normClass = (v) => (CLASSES.has((v || '').trim()) ? (v || '').trim() : '')

// Time-of-day slot from dep_hour — shared by api and catalog (both have dep_hour).
const SLOT_CASE = `CASE
  WHEN dep_hour>=0 AND dep_hour<8 THEN 'night'
  WHEN dep_hour>=8 AND dep_hour<14 THEN 'morning'
  WHEN dep_hour>=14 AND dep_hour<20 THEN 'afternoon'
  WHEN dep_hour>=20 AND dep_hour<24 THEN 'evening' END`

// ---- ASP formulas (shared by the operator AND route reports) ----
// Seater / Sleeper ASP = MEAN of per-trip booked ratios (booked_class_revenue ÷
// booked_class_seats). SAFE_DIVIDE → NULL when a trip booked no seats of that class,
// so AVG skips it (a class-less trip is NOT counted as ₹0). Overall ASP = the two
// class ASPs weighted by booked seats. Each fragment is an AGGREGATE expression, so it
// must sit inside a GROUP BY (or whole-scope) aggregate SELECT over the BASE rows.
const SEATER_ASP  = `AVG(SAFE_DIVIDE(booked_seater_revenue, seater_booked))`
const SLEEPER_ASP = `AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked))`
const OVERALL_ASP = `SAFE_DIVIDE(
    COALESCE(${SEATER_ASP},0)*SUM(seater_booked) + COALESCE(${SLEEPER_ASP},0)*SUM(sleeper_booked),
    NULLIF(SUM(seater_booked)+SUM(sleeper_booked),0))`

// Static descriptions for the fleet composition table (per class).
const CLASS_LABEL = { seater: 'Seater', sleeper: 'Sleeper', hybrid: 'Hybrid' }
const CLASS_DESC = {
  seater: 'A/C Seater configuration',
  sleeper: 'Pure sleeper buses',
  hybrid: 'A/C Seater / Sleeper (mixed)'
}
const SLOT_ORDER = ['night', 'morning', 'afternoon', 'evening']
const SLOT_LABEL = {
  night: 'Night / Early (00–08)',
  morning: 'Morning (08–14)',
  afternoon: 'Afternoon (14–20)',
  evening: 'Evening (20–24)'
}

function num(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object' && 'value' in v) v = v.value
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const arrow = (route) => String(route).replace(' -> ', ' → ')

// ---------------- Meta (drives the pickers) ----------------

export async function getMeta() {
  const windowSql = `
    WITH d AS (SELECT DISTINCT travel_date FROM ${FACT})
    SELECT
      FORMAT_DATE('%Y-%m-%d', MIN(travel_date)) AS win_start,
      FORMAT_DATE('%Y-%m-%d', MAX(travel_date)) AS win_end,
      COUNT(*) AS n_days,
      ARRAY_AGG(FORMAT_DATE('%Y-%m-%d', travel_date) ORDER BY travel_date) AS dates
    FROM d`
  const opsSql = `
    WITH t AS (${BASE})
    SELECT canon_operator AS operator, COUNT(*) AS trips,
           ARRAY_AGG(DISTINCT route ORDER BY route) AS routes
    FROM t GROUP BY canon_operator ORDER BY trips DESC`

  // Global route list (all routes in the window) for the route-report picker.
  const routesSql = `
    WITH t AS (${BASE})
    SELECT route, COUNT(*) AS trips FROM t GROUP BY route ORDER BY trips DESC`

  const [win, ops, routes] = await Promise.all([
    runSelect(windowSql), runSelect(opsSql), runSelect(routesSql)
  ])
  const w = win[0] || {}
  return {
    window: {
      start: w.win_start || null,
      end: w.win_end || null,
      nDays: num(w.n_days) || 0,
      dates: Array.isArray(w.dates) ? w.dates : []
    },
    operators: ops.map(o => ({
      name: o.operator,
      trips: num(o.trips) || 0,
      routes: Array.isArray(o.routes) ? o.routes : []
    })),
    routes: routes.map(r => ({ route: r.route, trips: num(r.trips) || 0 })),
    generatedAt: new Date().toISOString()
  }
}

// ---------------- Full report ----------------

export async function getReport({ operator, from, to, busClass }) {
  const cls = normClass(busClass)                 // '' = all bus types
  const clsPred = cls ? ' AND bus_class = @busClass' : ''
  // Shadow the module-level scope strings so the optional bus-class filter narrows
  // BOTH the operator's own figures and the market comparison (apples-to-apples).
  const OP = `canon_operator = @operator AND travel_date BETWEEN DATE(@from) AND DATE(@to)${clsPred}`
  const RANGE = `travel_date BETWEEN DATE(@from) AND DATE(@to)${clsPred}`
  const params = cls ? { operator, from, to, busClass: cls } : { operator, from, to }
  const types = cls ? { ...TYPES, busClass: 'STRING' } : TYPES
  const q = (sql) => runSelect(sql, params, types)

  const ndCTE = `nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM t WHERE ${OP})`
  const opRoutesCTE = `op_routes AS (SELECT DISTINCT route FROM t WHERE ${OP})`

  const Q = {
    // n_days / occupancy / revenue / ASP from the captured scrape (api); trip
    // COUNT from the catalog (scheduled departures).
    exec: `WITH t AS (${BASE})
      SELECT COUNT(DISTINCT travel_date) AS n_days,
        ROUND(AVG(occupancy_pct),1) AS avg_occ,
        ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(DISTINCT travel_date),0)) AS rev_per_day,
        ROUND(${OVERALL_ASP}) AS overall_asp,
        (SELECT COUNT(*) FROM ${CAT} WHERE ${OP}) AS trip_count,
        COUNT(*) AS captured_count
      FROM t WHERE ${OP}`,

    // Fleet counts (buses/day, routes) from the catalog (scheduled).
    composition: `WITH nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM ${CAT} WHERE ${OP})
      SELECT bus_class,
        ROUND(COUNT(*)/NULLIF((SELECT n FROM nd),0)) AS buses_per_day,
        COUNT(DISTINCT route) AS routes,
        COUNT(*) AS trips,
        APPROX_TOP_COUNT(bus_type, 1)[OFFSET(0)].value AS sample_bus_type
      FROM ${CAT} WHERE ${OP} AND bus_class IN ('seater','sleeper','hybrid')
      GROUP BY bus_class`,

    matrix: `WITH t AS (${BASE}),
      nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM ${CAT} WHERE ${OP}),
      agg AS (SELECT route, ANY_VALUE(src) AS src, ANY_VALUE(dst) AS dst,
        COUNTIF(bus_class='seater') AS seater_trips,
        COUNTIF(bus_class='sleeper') AS sleeper_trips,
        COUNTIF(bus_class='hybrid') AS hybrid_trips,
        COUNT(*) AS total_trips
        FROM ${CAT} WHERE ${OP} GROUP BY route),
      cap AS (SELECT route, COUNT(*) AS captured FROM t WHERE ${OP} GROUP BY route)
      SELECT agg.route, agg.src, agg.dst,
        ROUND(agg.seater_trips/NULLIF((SELECT n FROM nd),0)) AS seater_per_day,
        ROUND(agg.sleeper_trips/NULLIF((SELECT n FROM nd),0)) AS sleeper_per_day,
        ROUND(agg.hybrid_trips/NULLIF((SELECT n FROM nd),0)) AS hybrid_per_day,
        ROUND(agg.total_trips/NULLIF((SELECT n FROM nd),0)) AS buses_per_day,
        agg.total_trips,
        IFNULL(cap.captured,0) AS captured,
        ROUND(100*IFNULL(cap.captured,0)/NULLIF(agg.total_trips,0)) AS coverage_pct
      FROM agg LEFT JOIN cap USING (route) ORDER BY agg.total_trips DESC`,

    revMetrics: `WITH t AS (${BASE})
      SELECT ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(DISTINCT travel_date),0)) AS rev_per_day,
        ROUND(${OVERALL_ASP}) AS overall_asp,
        ROUND(${SEATER_ASP}) AS seater_asp,
        ROUND(${SLEEPER_ASP}) AS sleeper_asp
      FROM t WHERE ${OP}`,

    distribution: `WITH t AS (${BASE}), ${ndCTE},
      r AS (SELECT route, SUM(booked_revenue_inr) AS period_rev FROM t WHERE ${OP} GROUP BY route)
      SELECT route,
        ROUND(period_rev/NULLIF((SELECT n FROM nd),0)) AS revenue_per_day,
        ROUND(100*period_rev/NULLIF(SUM(period_rev) OVER(),0),1) AS share_pct,
        ROUND(period_rev) AS period_total
      FROM r ORDER BY period_rev DESC`,

    split: `WITH t AS (${BASE}), ${ndCTE},
      s AS (SELECT SUM(booked_seater_revenue) AS sr, SUM(booked_sleeper_revenue) AS slr FROM t WHERE ${OP})
      SELECT 'Seater' AS segment, ROUND(100*sr/NULLIF(sr+slr,0),1) AS share_pct,
        ROUND(sr/NULLIF((SELECT n FROM nd),0)) AS revenue_per_day, ROUND(sr) AS period_total FROM s
      UNION ALL
      SELECT 'Sleeper', ROUND(100*slr/NULLIF(sr+slr,0),1),
        ROUND(slr/NULLIF((SELECT n FROM nd),0)), ROUND(slr) FROM s`,

    bestRoutes: `WITH t AS (${BASE}),
      sched AS (SELECT route, COUNT(*) AS scheduled FROM ${CAT} WHERE ${OP} GROUP BY route),
      api AS (SELECT route,
        CAST(ROUND(ANY_VALUE(distance_km)) AS INT64) AS distance_km,
        COUNT(*) AS captured,
        ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0)) AS revenue_per_trip,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0), NULLIF(ANY_VALUE(distance_km),0))) AS revenue_per_km,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr), SUM(distance_km*total_seats)),2) AS rev_per_seat_km,
        ROUND(SAFE_DIVIDE(SUM(booked_seater_revenue), SUM(distance_km*(IFNULL(seater_booked,0)+IFNULL(seater_available,0)))),2) AS rev_per_seater_km,
        ROUND(SAFE_DIVIDE(SUM(booked_sleeper_revenue), SUM(distance_km*(IFNULL(sleeper_booked,0)+IFNULL(sleeper_available,0)))),2) AS rev_per_sleeper_km,
        ROUND(${SEATER_ASP}) AS avg_seater_price,
        ROUND(${SLEEPER_ASP}) AS avg_sleeper_price,
        ROUND(AVG(occupancy_pct),1) AS occ_pct
        FROM t WHERE ${OP} GROUP BY route)
      SELECT api.route, api.distance_km, api.revenue_per_trip, api.revenue_per_km,
        api.rev_per_seat_km, api.rev_per_seater_km, api.rev_per_sleeper_km,
        api.avg_seater_price, api.avg_sleeper_price, api.occ_pct,
        api.captured, IFNULL(sched.scheduled, api.captured) AS scheduled,
        ROUND(100*api.captured/NULLIF(sched.scheduled,0)) AS coverage_pct,
        ROW_NUMBER() OVER (ORDER BY api.revenue_per_trip DESC) AS rank
      FROM api LEFT JOIN sched USING (route) ORDER BY api.revenue_per_trip DESC`,

    daily: `WITH t AS (${BASE})
      SELECT FORMAT_DATE('%Y-%m-%d', travel_date) AS date,
        ROUND(AVG(occupancy_pct),1) AS occ_pct,
        ROUND(SUM(booked_revenue_inr)) AS revenue
      FROM t WHERE ${OP} GROUP BY travel_date ORDER BY travel_date`,

    timeOfDay: `WITH t AS (${BASE}),
      api_rows AS (SELECT ${SLOT_CASE} AS slot, occupancy_pct AS occ FROM t WHERE ${OP} AND dep_hour IS NOT NULL),
      occ_by_slot AS (SELECT slot, ROUND(AVG(occ),1) AS avg_occ_pct FROM api_rows WHERE slot IS NOT NULL GROUP BY slot),
      cat_rows AS (SELECT ${SLOT_CASE} AS slot FROM ${CAT} WHERE ${OP} AND dep_hour IS NOT NULL),
      trips_by_slot AS (SELECT slot, COUNT(*) AS trips FROM cat_rows WHERE slot IS NOT NULL GROUP BY slot)
      SELECT COALESCE(occ_by_slot.slot, trips_by_slot.slot) AS slot,
        occ_by_slot.avg_occ_pct, IFNULL(trips_by_slot.trips, 0) AS trips
      FROM occ_by_slot FULL JOIN trips_by_slot USING (slot)`,

    overall: `WITH t AS (${BASE}), ${opRoutesCTE},
      op AS (SELECT 'operator' AS side, AVG(occupancy_pct) AS occ,
        ${SEATER_ASP} AS sa,
        ${SLEEPER_ASP} AS sl
        FROM t WHERE ${OP}),
      mkt AS (SELECT 'market' AS side, AVG(occupancy_pct) AS occ,
        ${SEATER_ASP} AS sa,
        ${SLEEPER_ASP} AS sl
        FROM t WHERE canon_operator != @operator AND ${RANGE} AND route IN (SELECT route FROM op_routes))
      SELECT side, ROUND(occ,1) AS occ_pct, ROUND(sa) AS seater_asp, ROUND(sl) AS sleeper_asp FROM op
      UNION ALL
      SELECT side, ROUND(occ,1), ROUND(sa), ROUND(sl) FROM mkt`,

    percentiles: `WITH t AS (${BASE}), ${opRoutesCTE},
      u AS (
        SELECT 'operator' AS side, occupancy_pct AS occ FROM t WHERE ${OP} AND occupancy_pct IS NOT NULL
        UNION ALL
        SELECT 'market' AS side, occupancy_pct FROM t
          WHERE canon_operator != @operator AND ${RANGE} AND route IN (SELECT route FROM op_routes) AND occupancy_pct IS NOT NULL)
      SELECT side, ROUND(AVG(occ),1) AS mean,
        ROUND(APPROX_QUANTILES(occ,100)[OFFSET(50)],1) AS p50,
        ROUND(APPROX_QUANTILES(occ,100)[OFFSET(75)],1) AS p75,
        ROUND(APPROX_QUANTILES(occ,100)[OFFSET(90)],1) AS p90
      FROM u GROUP BY side`,

    byRoute: `WITH t AS (${BASE}), ${opRoutesCTE},
      op AS (SELECT route, AVG(occupancy_pct) AS occ, ${OVERALL_ASP} AS asp
        FROM t WHERE ${OP} GROUP BY route),
      mkt AS (SELECT route, AVG(occupancy_pct) AS occ, ${OVERALL_ASP} AS asp,
        APPROX_QUANTILES(occupancy_pct,100)[OFFSET(50)] AS p50,
        APPROX_QUANTILES(occupancy_pct,100)[OFFSET(75)] AS p75,
        APPROX_QUANTILES(occupancy_pct,100)[OFFSET(90)] AS p90
        FROM t WHERE canon_operator != @operator AND ${RANGE} AND route IN (SELECT route FROM op_routes) GROUP BY route)
      SELECT op.route, ROUND(op.occ,1) AS op_occ_pct, ROUND(mkt.occ,1) AS mkt_occ_pct,
        ROUND(op.asp) AS op_asp, ROUND(mkt.asp) AS mkt_asp,
        ROUND(mkt.p50,1) AS mkt_p50, ROUND(mkt.p75,1) AS mkt_p75, ROUND(mkt.p90,1) AS mkt_p90
      FROM op LEFT JOIN mkt USING (route) ORDER BY op.route`,

    // Frequency leaders per route: trips (ranking) from the catalog (scheduled),
    // occupancy/ASP from the api. op_routes = the operator's scheduled routes.
    topOps: `WITH t AS (${BASE}),
      op_routes AS (SELECT DISTINCT route FROM ${CAT} WHERE ${OP}),
      cat AS (SELECT route, canon_operator AS operator, COUNT(*) AS trips
        FROM ${CAT} WHERE ${RANGE} AND route IN (SELECT route FROM op_routes)
        GROUP BY route, canon_operator),
      api AS (SELECT route, canon_operator AS operator,
        AVG(occupancy_pct) AS occ,
        ${SEATER_ASP} AS sa,
        ${SLEEPER_ASP} AS sl
        FROM t WHERE ${RANGE} AND route IN (SELECT route FROM op_routes)
        GROUP BY route, canon_operator),
      j AS (SELECT COALESCE(cat.route, api.route) AS route, COALESCE(cat.operator, api.operator) AS operator,
        IFNULL(cat.trips, 0) AS trips, api.occ, api.sa, api.sl
        FROM cat FULL JOIN api ON cat.route = api.route AND cat.operator = api.operator),
      ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY route ORDER BY trips DESC, operator) AS rnk FROM j)
      SELECT route, operator, rnk, trips,
        ROUND(occ,1) AS occ_pct, ROUND(sa) AS seater_asp, ROUND(sl) AS sleeper_asp,
        (operator = @operator) AS is_subject
      FROM ranked WHERE rnk <= 5 OR operator = @operator ORDER BY route, rnk`,

    // §6 Cross-Operator Comparison — every operator on the subject's routes
    // (subject + all others), so the client can compare against any of them.
    crossOps: `WITH t AS (${BASE}), ${opRoutesCTE}
      SELECT route, canon_operator AS operator, COUNT(*) AS trips,
        ANY_VALUE(distance_km) AS distance_km,
        ROUND(AVG(occupancy_pct),1) AS occ,
        ROUND(${OVERALL_ASP}) AS asp,
        ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0)) AS r_trip
      FROM t WHERE ${RANGE} AND route IN (SELECT route FROM op_routes)
      GROUP BY route, canon_operator`,

    // §7 Suggested Routes — market-wide per-corridor metrics (all operators), so
    // the client can rank by revenue/occupancy/both and filter by presence.
    // Market corridors: trips/day from the catalog (scheduled); revenue / occ /
    // EV% / presence from the api.
    suggested: `WITH t AS (${BASE}),
      nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM t WHERE ${RANGE}),
      cat AS (SELECT route, COUNT(*) AS trips FROM ${CAT} WHERE ${RANGE} GROUP BY route),
      api AS (SELECT route, ANY_VALUE(src) AS src, ANY_VALUE(dst) AS dst,
        CAST(ROUND(ANY_VALUE(distance_km)) AS INT64) AS distance_km,
        ROUND(SUM(booked_revenue_inr)/NULLIF((SELECT n FROM nd),0)) AS mkt_rev_day,
        ROUND(AVG(occupancy_pct),1) AS mkt_occ,
        COUNT(DISTINCT canon_operator) AS operators,
        ROUND(100*COUNTIF(is_ev=TRUE)/NULLIF(COUNT(*),0),1) AS ev_pct,
        MAX(IF(canon_operator=@operator,1,0)) AS subject_runs,
        ARRAY_AGG(DISTINCT canon_operator) AS ops
        FROM t WHERE ${RANGE} GROUP BY route)
      SELECT api.route, api.src, api.dst, api.distance_km, api.mkt_rev_day, api.mkt_occ,
        IFNULL(cat.trips, 0) AS cat_trips, api.operators, api.ev_pct, api.subject_runs, api.ops
      FROM api LEFT JOIN cat USING (route)`
  }

  const [
    exec, composition, matrix, revMetrics, distribution, split, bestRoutes,
    daily, timeOfDay, overall, percentiles, byRoute, topOps, crossOps, suggested
  ] = await Promise.all([
    q(Q.exec), q(Q.composition), q(Q.matrix), q(Q.revMetrics), q(Q.distribution),
    q(Q.split), q(Q.bestRoutes), q(Q.daily), q(Q.timeOfDay), q(Q.overall),
    q(Q.percentiles), q(Q.byRoute), q(Q.topOps), q(Q.crossOps), q(Q.suggested)
  ])

  const e = exec[0] || {}
  const nDays = num(e.n_days) || 0
  const tripCount = num(e.trip_count) || 0           // scheduled departures (catalog)
  const captured = num(e.captured_count) || 0        // captured trips (api scrape)
  const coveragePct = tripCount ? Math.round(100 * captured / tripCount) : null
  const revPerDay = num(e.rev_per_day) || 0
  const avgOcc = num(e.avg_occ) || 0

  return {
    // meta.routes = the operator's routes that actually have trips in this range
    // (ordered by trips desc), used to populate/seed the competitive route picker.
    meta: { operator, from, to, nDays, tripCount, tripsScheduled: tripCount, tripsCaptured: captured, coveragePct,
            routes: matrix.map(r => r.route), generatedAt: new Date().toISOString() },
    operator,
    busClass: cls || null,             // active bus-class filter, or null for all bus types
    exec: {
      kpis: { avgOccPct: avgOcc, avgRevDay: revPerDay, overallAsp: num(e.overall_asp) }
    },
    fleet: buildFleet(composition, matrix, nDays),
    revenue: buildRevenue(revMetrics, distribution, split, bestRoutes),
    occupancy: buildOccupancy(daily, timeOfDay, avgOcc, revPerDay, nDays),
    competitive: buildCompetitive(overall, percentiles, byRoute, topOps, operator, nDays),
    crossOperator: buildCrossOperator(crossOps, operator),
    suggested: buildSuggested(suggested, operator, nDays)
  }
}

// trips/day = raw catalog trip count ÷ distinct dates. Returned UNROUNDED so the
// frontend's `tripsDay` formatter can show "<1" for sparse slots/operators
// instead of a misleading "0" next to real occupancy.
function perDay(trips, nDays) { return nDays ? (num(trips) || 0) / nDays : 0 }

// ---------------- Route-level report ----------------

export async function getRouteReport({ route, from, to, operator, busClass }) {
  const op = (operator || '').trim()   // optional: narrow the report to one operator on the route
  const cls = normClass(busClass)      // optional bus-class filter; '' = all bus types
  const clsPred = cls ? ' AND bus_class = @busClass' : ''
  const baseParams = { route, from, to, ...(cls ? { busClass: cls } : {}) }
  const baseTypes = { route: 'STRING', from: 'STRING', to: 'STRING', ...(cls ? { busClass: 'STRING' } : {}) }
  const opParams = op ? { ...baseParams, operator: op } : baseParams
  const opTypes = op ? { ...baseTypes, operator: 'STRING' } : baseTypes
  // qMarket → the whole route (all operators). qScoped → narrowed to the selected
  // operator when one is chosen; identical to qMarket when none is. The two runners
  // keep the @operator param off queries that don't reference it (BQ rejects unused params).
  const qMarket = (sql) => runSelect(sql, baseParams, baseTypes)
  const qScoped = (sql) => runSelect(sql, opParams, opTypes)
  // The bus-class predicate rides on MSCOPE, so it narrows the whole route market
  // (landscape + operator picker + metrics) — not just the selected operator.
  const MSCOPE = `route = @route AND travel_date BETWEEN DATE(@from) AND DATE(@to)${clsPred}`
  const RSCOPE = op ? `${MSCOPE} AND canon_operator = @operator` : MSCOPE
  const ndCTE = `nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM t WHERE ${RSCOPE})`
  const ndCTEm = `nd AS (SELECT COUNT(DISTINCT travel_date) AS n FROM t WHERE ${MSCOPE})`

  const Q = {
    // trips + operators from the catalog (scheduled); occupancy/revenue/ASP/EV%
    // + unique buses from the captured scrape (api). (Catalog has NULL bus_id, so
    // unique buses can only come from the api.)
    exec: `WITH t AS (${BASE})
      SELECT COUNT(DISTINCT travel_date) AS n_days,
        (SELECT COUNT(*) FROM ${CAT} WHERE ${RSCOPE}) AS trips,
        (SELECT COUNT(DISTINCT canon_operator) FROM ${CAT} WHERE ${RSCOPE}) AS operators,
        COUNT(*) AS captured_count,
        COUNT(DISTINCT unique_bus_id) AS unique_buses,
        ROUND(AVG(occupancy_pct),1) AS avg_occ,
        ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(DISTINCT travel_date),0)) AS rev_per_day,
        ROUND(${OVERALL_ASP}) AS overall_asp,
        ROUND(AVG(duration_hrs),2) AS avg_dur,
        CAST(ROUND(ANY_VALUE(distance_km)) AS INT64) AS km,
        ROUND(100*COUNTIF(is_ev=TRUE)/NULLIF(COUNT(*),0),1) AS ev_pct
      FROM t WHERE ${RSCOPE}`,

    revMetrics: `WITH t AS (${BASE})
      SELECT ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(DISTINCT travel_date),0)) AS rev_per_day,
        ROUND(${OVERALL_ASP}) AS overall_asp,
        ROUND(${SEATER_ASP}) AS seater_asp,
        ROUND(${SLEEPER_ASP}) AS sleeper_asp
      FROM t WHERE ${RSCOPE}`,

    unit: `WITH t AS (${BASE})
      SELECT ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0)) AS rev_per_trip,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0), NULLIF(ANY_VALUE(distance_km),0))) AS rev_per_km,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr), SUM(distance_km*total_seats)),2) AS rev_per_seat_km,
        ROUND(SAFE_DIVIDE(SUM(booked_seater_revenue), SUM(distance_km*(IFNULL(seater_booked,0)+IFNULL(seater_available,0)))),2) AS rev_per_seater_km,
        ROUND(SAFE_DIVIDE(SUM(booked_sleeper_revenue), SUM(distance_km*(IFNULL(sleeper_booked,0)+IFNULL(sleeper_available,0)))),2) AS rev_per_sleeper_km
      FROM t WHERE ${RSCOPE}`,

    split: `WITH t AS (${BASE}), ${ndCTE},
      s AS (SELECT SUM(booked_seater_revenue) AS sr, SUM(booked_sleeper_revenue) AS slr FROM t WHERE ${RSCOPE})
      SELECT 'Seater' AS segment, ROUND(100*sr/NULLIF(sr+slr,0),1) AS share_pct,
        ROUND(sr/NULLIF((SELECT n FROM nd),0)) AS revenue_per_day, ROUND(sr) AS period_total FROM s
      UNION ALL
      SELECT 'Sleeper', ROUND(100*slr/NULLIF(sr+slr,0),1),
        ROUND(slr/NULLIF((SELECT n FROM nd),0)), ROUND(slr) FROM s`,

    daily: `WITH t AS (${BASE})
      SELECT FORMAT_DATE('%Y-%m-%d', travel_date) AS date,
        ROUND(AVG(occupancy_pct),1) AS occ_pct, ROUND(SUM(booked_revenue_inr)) AS revenue
      FROM t WHERE ${RSCOPE} GROUP BY travel_date ORDER BY travel_date`,

    // occupancy from api; trips from catalog (scheduled).
    timeOfDay: `WITH t AS (${BASE}),
      api_rows AS (SELECT ${SLOT_CASE} AS slot, occupancy_pct AS occ FROM t WHERE ${RSCOPE} AND dep_hour IS NOT NULL),
      occ_by_slot AS (SELECT slot, ROUND(AVG(occ),1) AS avg_occ_pct FROM api_rows WHERE slot IS NOT NULL GROUP BY slot),
      cat_rows AS (SELECT ${SLOT_CASE} AS slot FROM ${CAT} WHERE ${RSCOPE} AND dep_hour IS NOT NULL),
      trips_by_slot AS (SELECT slot, COUNT(*) AS trips FROM cat_rows WHERE slot IS NOT NULL GROUP BY slot)
      SELECT COALESCE(occ_by_slot.slot, trips_by_slot.slot) AS slot,
        occ_by_slot.avg_occ_pct, IFNULL(trips_by_slot.trips, 0) AS trips
      FROM occ_by_slot FULL JOIN trips_by_slot USING (slot)`,

    // Operator landscape: trips/day from catalog (scheduled); occupancy/ASP/
    // revenue/share from api. Ranked by api revenue (top 15). ALWAYS market-wide
    // (all operators) so it stays the competitive context even when the report is
    // narrowed to one operator — the selected operator is flagged for highlighting.
    operators: `WITH t AS (${BASE}), ${ndCTEm},
      tot AS (SELECT SUM(booked_revenue_inr) AS total_rev FROM t WHERE ${MSCOPE}),
      cat AS (SELECT canon_operator AS operator, COUNT(*) AS trips FROM ${CAT} WHERE ${MSCOPE} GROUP BY canon_operator),
      per_op AS (SELECT canon_operator AS operator, COUNT(*) AS captured, AVG(occupancy_pct) AS occ,
        ${SEATER_ASP} AS sa,
        ${SLEEPER_ASP} AS sl,
        SUM(booked_revenue_inr) AS period_rev,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0), NULLIF(ANY_VALUE(distance_km),0))) AS rev_per_km,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr), SUM(distance_km*total_seats)),2) AS rev_per_seat_km,
        ROUND(SAFE_DIVIDE(SUM(booked_seater_revenue), SUM(distance_km*(IFNULL(seater_booked,0)+IFNULL(seater_available,0)))),2) AS rev_per_seater_km,
        ROUND(SAFE_DIVIDE(SUM(booked_sleeper_revenue), SUM(distance_km*(IFNULL(sleeper_booked,0)+IFNULL(sleeper_available,0)))),2) AS rev_per_sleeper_km
        FROM t WHERE ${MSCOPE} GROUP BY canon_operator)
      SELECT COALESCE(per_op.operator, cat.operator) AS operator,
        IFNULL(cat.trips, 0) AS trips,
        SAFE_DIVIDE(IFNULL(cat.trips, 0), NULLIF((SELECT n FROM nd),0)) AS trips_day,
        ROUND(per_op.occ,1) AS occ_pct, ROUND(per_op.sa) AS seater_asp, ROUND(per_op.sl) AS sleeper_asp,
        ROUND(per_op.period_rev/NULLIF((SELECT n FROM nd),0)) AS revenue_per_day,
        ROUND(100*per_op.period_rev/NULLIF((SELECT total_rev FROM tot),0),1) AS share_pct,
        per_op.rev_per_km, per_op.rev_per_seat_km, per_op.rev_per_seater_km, per_op.rev_per_sleeper_km,
        ROUND(100*IFNULL(per_op.captured,0)/NULLIF(cat.trips,0)) AS coverage_pct,
        ROW_NUMBER() OVER (ORDER BY per_op.period_rev DESC NULLS LAST) AS rank
      FROM per_op FULL JOIN cat USING (operator)
      ORDER BY per_op.period_rev DESC NULLS LAST LIMIT 15`,

    evIce: `WITH t AS (${BASE}), ${ndCTE}
      SELECT IF(is_ev=TRUE,'EV','ICE') AS fuel, COUNT(*) AS cnt,
        COUNT(*)/NULLIF((SELECT n FROM nd),0) AS trips_per_day,
        ROUND(AVG(occupancy_pct),1) AS occ_pct,
        ROUND(${SEATER_ASP}) AS seater_asp,
        ROUND(${SLEEPER_ASP}) AS sleeper_asp,
        ROUND(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0)) AS revenue_per_trip,
        ROUND(SAFE_DIVIDE(SUM(booked_revenue_inr)/NULLIF(COUNT(*),0), NULLIF(ANY_VALUE(distance_km),0))) AS rev_per_km,
        ROUND(SAFE_DIVIDE(SUM(booked_seater_revenue), SUM(distance_km*(IFNULL(seater_booked,0)+IFNULL(seater_available,0)))),2) AS rev_per_seater_km,
        ROUND(SAFE_DIVIDE(SUM(booked_sleeper_revenue), SUM(distance_km*(IFNULL(sleeper_booked,0)+IFNULL(sleeper_available,0)))),2) AS rev_per_sleeper_km
      FROM t WHERE ${RSCOPE} AND is_ev IS NOT NULL GROUP BY fuel ORDER BY fuel`,

    evIceDaily: `WITH t AS (${BASE})
      SELECT FORMAT_DATE('%Y-%m-%d', travel_date) AS date,
        ROUND(SUM(IF(is_ev=TRUE,booked_revenue_inr,0))) AS ev_rev,
        ROUND(SUM(IF(is_ev=FALSE,booked_revenue_inr,0))) AS ice_rev,
        ROUND(AVG(IF(is_ev=TRUE,occupancy_pct,NULL)),1) AS ev_occ,
        ROUND(AVG(IF(is_ev=FALSE,occupancy_pct,NULL)),1) AS ice_occ
      FROM t WHERE ${RSCOPE} GROUP BY travel_date ORDER BY travel_date`,

    evIceFleet: `WITH t AS (${BASE})
      SELECT bus_type, COUNTIF(is_ev=TRUE) AS ev_cnt, COUNTIF(is_ev=FALSE) AS ice_cnt, COUNT(*) AS total
      FROM t WHERE ${RSCOPE} GROUP BY bus_type ORDER BY total DESC LIMIT 10`,

    // Every operator scheduled on this route (catalog), busiest first — populates
    // the route report's optional operator filter. Always market-wide.
    routeOperators: `SELECT canon_operator AS operator, COUNT(*) AS trips
      FROM ${CAT} WHERE ${MSCOPE} GROUP BY canon_operator ORDER BY trips DESC`
  }

  const [rExec, rRev, rUnit, rSplit, rDaily, rTime, rEv, rEvDaily, rEvFleet, rOps, rOpsList] = await Promise.all([
    // metric sections — narrowed to the selected operator when one is chosen
    qScoped(Q.exec), qScoped(Q.revMetrics), qScoped(Q.unit), qScoped(Q.split), qScoped(Q.daily), qScoped(Q.timeOfDay),
    qScoped(Q.evIce), qScoped(Q.evIceDaily), qScoped(Q.evIceFleet),
    // always market-wide: the competitive landscape + the operator picker list
    qMarket(Q.operators), qMarket(Q.routeOperators)
  ])

  const e = rExec[0] || {}
  const nDays = num(e.n_days) || 0
  const tripCount = num(e.trips) || 0                // scheduled departures (catalog)
  const captured = num(e.captured_count) || 0        // captured trips (api scrape)
  const coveragePct = tripCount ? Math.round(100 * captured / tripCount) : null
  const revPerDay = num(e.rev_per_day) || 0
  const avgOcc = num(e.avg_occ) || 0
  const m = rRev[0] || {}
  const u = rUnit[0] || {}
  const evByFuel = Object.fromEntries(rEv.map(r => [r.fuel, r]))
  const evCnt = num(evByFuel.EV?.cnt) || 0
  const iceCnt = num(evByFuel.ICE?.cnt) || 0
  const evPenetration = (evCnt + iceCnt) ? Math.round(1000 * evCnt / (evCnt + iceCnt)) / 10 : 0
  // All operators on the route (busiest first) — drives the picker; length = the
  // corridor's total operator count (a route property, unchanged by the filter).
  const routeOperators = rOpsList.map(r => r.operator)
  const totalRouteOperators = routeOperators.length || num(e.operators) || 0

  return {
    meta: { route, from, to, nDays, tripCount, tripsScheduled: tripCount, tripsCaptured: captured, coveragePct,
            routeOperators, generatedAt: new Date().toISOString() },
    route,
    routeOperator: op || null,          // the selected operator, or null for the whole-route market view
    busClass: cls || null,              // active bus-class filter, or null for all bus types
    exec: { kpis: { avgOccPct: avgOcc, avgRevDay: revPerDay, overallAsp: num(e.overall_asp) } },
    profile: {
      metrics: {
        distanceKm: num(e.km), operators: totalRouteOperators, uniqueBuses: num(e.unique_buses) || 0,
        tripsPerDay: nDays ? Math.round(tripCount / nDays) : 0,
        avgTripDuration: num(e.avg_dur), evPenetration: num(e.ev_pct),
        projMonthly: Math.round(revPerDay * 30)
      }
    },
    revenue: {
      metrics: { avgRevDay: num(m.rev_per_day) || 0, overallAsp: num(m.overall_asp), seaterAsp: num(m.seater_asp), sleeperAsp: num(m.sleeper_asp) },
      unitEconomics: {
        revPerTrip: num(u.rev_per_trip), revPerKm: num(u.rev_per_km), revPerSeatKm: num(u.rev_per_seat_km),
        revPerSeaterKm: num(u.rev_per_seater_km), revPerSleeperKm: num(u.rev_per_sleeper_km)
      },
      split: rSplit.map(r => ({ segment: r.segment, share: num(r.share_pct) || 0, revDay: num(r.revenue_per_day) || 0, period: num(r.period_total) || 0 }))
    },
    occupancy: buildOccupancy(rDaily, rTime, avgOcc, revPerDay, nDays),
    operatorLandscape: {
      operators: rOps.map(r => ({
        rank: num(r.rank), operator: r.operator, tripsDay: num(r.trips_day),
        occupancy: num(r.occ_pct), seaterAsp: num(r.seater_asp), sleeperAsp: num(r.sleeper_asp),
        revDay: num(r.revenue_per_day) || 0, share: num(r.share_pct) || 0,
        revPerKm: num(r.rev_per_km), revPerSeatKm: num(r.rev_per_seat_km),
        revPerSeaterKm: num(r.rev_per_seater_km), revPerSleeperKm: num(r.rev_per_sleeper_km),
        coveragePct: num(r.coverage_pct),
        isSubject: !!op && r.operator === op       // highlight the selected operator's row
      })),
      totalOperators: totalRouteOperators
    },
    evIce: {
      evPenetration,
      comparison: rEv.map(r => ({
        fuel: r.fuel, tripsDay: num(r.trips_per_day), occupancy: num(r.occ_pct),
        seaterAsp: num(r.seater_asp), sleeperAsp: num(r.sleeper_asp), revPerTrip: num(r.revenue_per_trip),
        revPerKm: num(r.rev_per_km), revPerSeaterKm: num(r.rev_per_seater_km), revPerSleeperKm: num(r.rev_per_sleeper_km)
      })),
      daily: rEvDaily.map(r => ({ date: r.date, evRev: num(r.ev_rev) || 0, iceRev: num(r.ice_rev) || 0, evOcc: num(r.ev_occ), iceOcc: num(r.ice_occ) })),
      fleet: rEvFleet.map(r => ({ busType: r.bus_type, evCnt: num(r.ev_cnt) || 0, iceCnt: num(r.ice_cnt) || 0 }))
    }
  }
}

// ---------------- Section builders ----------------

function buildFleet(composition, matrix, nDays) {
  const byClass = Object.fromEntries(composition.map(r => [r.bus_class, r]))
  const compRows = ['seater', 'sleeper', 'hybrid'].map(cls => {
    const r = byClass[cls] || {}
    return {
      type: CLASS_LABEL[cls],
      busesDay: num(r.buses_per_day) || 0,
      routes: num(r.routes) || 0,
      // Use the operator's most common bus_type for this class as the description
      // (reproduces the template's "Electric A/C Seater (2+2)" style); fall back
      // to a generic label when the class isn't operated.
      description: r.sample_bus_type || CLASS_DESC[cls]
    }
  })
  const totalTrips = matrix.reduce((s, r) => s + (num(r.total_trips) || 0), 0)
  const compTotal = {
    type: 'Total',
    busesDay: nDays ? Math.round(totalTrips / nDays) : 0,
    routes: matrix.length,
    description: '',
    isTotal: true
  }

  const matRows = matrix.map((r, i) => ({
    route: `Route ${i + 1}`,            // matrix is ordered by total trips desc
    od: arrow(r.route),
    seater: num(r.seater_per_day) || 0,
    sleeper: num(r.sleeper_per_day) || 0,
    hybrid: num(r.hybrid_per_day) || 0,
    busesDay: num(r.buses_per_day) || 0,
    totalTrips: num(r.total_trips) || 0,
    captured: num(r.captured) || 0,
    coveragePct: num(r.coverage_pct)
  }))
  const totalCaptured = matrix.reduce((s, r) => s + (num(r.captured) || 0), 0)
  const sum = (k) => matRows.reduce((s, r) => s + (r[k] || 0), 0)
  const matTotal = {
    route: 'TOTAL', od: '',
    seater: sum('seater'), sleeper: sum('sleeper'), hybrid: sum('hybrid'),
    busesDay: nDays ? Math.round(totalTrips / nDays) : 0,
    totalTrips, captured: totalCaptured,
    coveragePct: totalTrips ? Math.round(100 * totalCaptured / totalTrips) : null,
    isTotal: true
  }

  return {
    composition: [...compRows, compTotal],
    matrix: [...matRows, matTotal]
  }
}

function buildRevenue(revMetrics, distribution, split, bestRoutes) {
  const m = revMetrics[0] || {}
  const distRows = distribution.map(r => ({
    route: arrow(r.route),
    revDay: num(r.revenue_per_day) || 0,
    share: num(r.share_pct) || 0,
    period: num(r.period_total) || 0
  }))
  const distTotal = {
    route: 'Total',
    revDay: distRows.reduce((s, r) => s + r.revDay, 0),
    share: 100,
    period: distRows.reduce((s, r) => s + r.period, 0),
    isTotal: true
  }
  return {
    metrics: {
      avgRevDay: num(m.rev_per_day) || 0,
      overallAsp: num(m.overall_asp),
      seaterAsp: num(m.seater_asp),
      sleeperAsp: num(m.sleeper_asp)
    },
    distribution: [...distRows, distTotal],
    split: split.map(r => ({
      segment: r.segment,
      share: num(r.share_pct) || 0,
      revDay: num(r.revenue_per_day) || 0,
      period: num(r.period_total) || 0
    })),
    bestRoutes: bestRoutes.map(r => ({
      rank: num(r.rank),
      route: arrow(r.route),
      distanceKm: num(r.distance_km),
      revPerTrip: num(r.revenue_per_trip),
      occPct: num(r.occ_pct),
      revPerKm: num(r.revenue_per_km),
      revPerSeatKm: num(r.rev_per_seat_km),
      revPerSeaterKm: num(r.rev_per_seater_km),
      revPerSleeperKm: num(r.rev_per_sleeper_km),
      avgSeaterPrice: num(r.avg_seater_price),
      avgSleeperPrice: num(r.avg_sleeper_price),
      coveragePct: num(r.coverage_pct)   // captured ÷ scheduled for this route
    }))
  }
}

function buildOccupancy(daily, timeOfDay, avgOcc, revPerDay, nDays) {
  const dailyRows = daily.map(r => ({
    date: r.date,
    occupancy: num(r.occ_pct),
    revenue: num(r.revenue) || 0
  }))
  dailyRows.push({ date: 'Avg / Day', occupancy: avgOcc, revenue: revPerDay, isTotal: true })

  const bySlot = Object.fromEntries(timeOfDay.map(r => [r.slot, r]))
  const slotRows = SLOT_ORDER.filter(s => bySlot[s]).map(s => ({
    slot: SLOT_LABEL[s],
    avgOccupancy: num(bySlot[s].avg_occ_pct),
    tripsDay: perDay(bySlot[s].trips, nDays)   // catalog trips/day
  }))
  return { daily: dailyRows, timeOfDay: slotRows }
}

function buildCompetitive(overall, percentiles, byRoute, topOps, operator, nDays) {
  const o = Object.fromEntries(overall.map(r => [r.side, r]))
  const op = o.operator || {}, mk = o.market || {}
  const overallRows = [
    { metric: 'Occupancy', operator: num(op.occ_pct), market: num(mk.occ_pct), format: 'pct1' },
    { metric: 'Seater ASP', operator: num(op.seater_asp), market: num(mk.seater_asp), format: 'rupee' },
    { metric: 'Sleeper ASP', operator: num(op.sleeper_asp), market: num(mk.sleeper_asp), format: 'rupee' }
  ]

  const p = Object.fromEntries(percentiles.map(r => [r.side, r]))
  const pctRows = ['operator', 'market'].map(side => {
    const r = p[side] || {}
    return {
      who: side === 'operator' ? operator : 'Market (same routes)',
      mean: num(r.mean), p50: num(r.p50), p75: num(r.p75), p90: num(r.p90)
    }
  })

  const byRouteRows = byRoute.map(r => ({
    route: arrow(r.route),
    opOcc: num(r.op_occ_pct), mktOcc: num(r.mkt_occ_pct),
    opAsp: num(r.op_asp), mktAsp: num(r.mkt_asp),
    mktP50: num(r.mkt_p50), mktP75: num(r.mkt_p75), mktP90: num(r.mkt_p90)
  }))

  // Group top operators by route. Keep top 5 + the subject (even if outside).
  const byRouteMap = {}
  for (const r of topOps) {
    if (!byRouteMap[r.route]) byRouteMap[r.route] = []
    byRouteMap[r.route].push(r)
  }
  const topOperators = {}
  for (const [route, rows] of Object.entries(byRouteMap)) {
    const subject = rows.find(x => x.is_subject)
    const subjectRank = subject ? num(subject.rnk) : null
    const inTop5 = subjectRank != null && subjectRank <= 5
    topOperators[route] = {
      routeLabel: arrow(route),
      operatorRank: subjectRank,
      operatorInTop5: inTop5,
      rankNote: subjectRank != null && !inTop5
        ? `${operator} ranks #${subjectRank} by frequency on this route (outside the top 5).`
        : null,
      rows: rows.map(x => ({
        operator: x.operator,
        tripsDay: perDay(x.trips, nDays),   // catalog trips/day
        occupancy: num(x.occ_pct),
        seaterAsp: num(x.seater_asp),
        sleeperAsp: num(x.sleeper_asp),
        isSubject: !!x.is_subject
      }))
    }
  }

  return {
    overall: overallRows,
    percentiles: pctRows,
    byRoute: byRouteRows,
    topOperators
  }
}

// §6 Cross-Operator Comparison: per-route metrics for every operator on the
// subject's routes, plus the list of selectable comparison operators.
function buildCrossOperator(rows, operator) {
  const byRoute = {}
  const opTrips = {}
  for (const r of rows) {
    const route = r.route
    if (!byRoute[route]) byRoute[route] = { route: arrow(route), distanceKm: num(r.distance_km), subjectTrips: 0, ops: {} }
    byRoute[route].ops[r.operator] = {
      occ: num(r.occ), asp: num(r.asp), rtrip: num(r.r_trip), trips: num(r.trips) || 0
    }
    if (r.operator === operator) byRoute[route].subjectTrips = num(r.trips) || 0
    opTrips[r.operator] = (opTrips[r.operator] || 0) + (num(r.trips) || 0)
  }
  const routes = Object.values(byRoute).sort((a, b) => b.subjectTrips - a.subjectTrips)
  const operatorOptions = Object.entries(opTrips)
    .filter(([name]) => name !== operator)
    .map(([name, trips]) => ({ name, trips }))
    .sort((a, b) => b.trips - a.trips)
  return { subject: operator, routes, operatorOptions }
}

// §7 Suggested Routes: market-wide per-corridor metrics (the client ranks +
// filters by presence). `ops` lets the client flag any operator's presence.
function buildSuggested(rows, operator, nDays) {
  const routes = rows.map(r => ({
    route: arrow(r.route),
    src: r.src, dst: r.dst,
    distanceKm: num(r.distance_km),
    mktRevDay: num(r.mkt_rev_day) || 0,
    mktOcc: num(r.mkt_occ),
    tripsDay: perDay(r.cat_trips, nDays),   // catalog trips/day
    operators: num(r.operators) || 0,
    evPct: num(r.ev_pct),
    subjectRuns: num(r.subject_runs) === 1,
    ops: Array.isArray(r.ops) ? r.ops : []
  }))
  return { subject: operator, routes }
}
