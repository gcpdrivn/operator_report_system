-- =============================================================================
-- Dashboard KPI tables — BigQuery (production).
-- =============================================================================
-- Source:       drivn-project-1.dunamic_window_scrapper_redbus.{redbus_today_catalog,
--                                                                redbus_scraper_api_based}
-- Destination:  drivn-project-1.dashboard_kpis.* (new dataset, this file creates it)
-- Location:     US (must match source dataset's location)
-- Refresh:      Daily via BQ Scheduled Query — see "HOW TO SCHEDULE" at bottom.
--
-- HOW TO USE
-- ----------
-- 1. ONE-TIME: paste this whole file into the BQ SQL Editor and run.
--    First run creates the dataset + 26 tables (incl. mv_fact_grain, the
--    granular client-aggregation base). Re-running is safe and
--    idempotent (every statement is CREATE OR REPLACE).
-- 2. SCHEDULE: in the BQ Console click "Schedule" -> "New scheduled query",
--    paste this file again as the body. Region: US. Daily 06:00 IST.
--    Owner: your gcloud user creds (NOT the dashboard read-only SA).
--
-- READ-ONLY GUARANTEE
-- -------------------
-- * The base tables in dunamic_window_scrapper_redbus are NEVER written to.
-- * Every statement below either (a) creates the dashboard_kpis dataset,
--   or (b) CREATE OR REPLACE TABLE in dashboard_kpis. Both are scoped to
--   the new dataset only.
-- * ALL data-quality fixes (catalog de-dup, the is_revenue_usable handling,
--   the booked-ASP derivation) are applied HERE, while building the MVs — the
--   source catalog/api tables are read as-is and left untouched. (The former
--   ₹1-lakh revenue cap has been removed; all revenue is consumed as-is.)
-- =============================================================================


-- =============================================================================
-- 0. ONE-TIME: create the destination dataset
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS `drivn-project-1.dashboard_kpis`
OPTIONS (
  location = "US",
  description = "Pre-aggregated KPI tables for the Drivn dashboard product. Refreshed daily from dunamic_window_scrapper_redbus. All tables are CREATE OR REPLACE; source tables never modified."
);


-- =============================================================================
-- 1. _fact_trips — trip-level fact, sourced from redbus_scraper_api_based
-- =============================================================================
-- SOURCE = api_based (the scrape output). It is self-sufficient: it carries the
-- full identity (route_source/destination, operator_name, bus_type, is_ev,
-- bus_id) AND every metric (revenue, seats, occupancy, prices, distance,
-- duration, rating). We DO NOT join the catalog any more: for the live data the
-- catalog rows have NULL bus_id and NULL status (the join key is null, so the
-- old catalog-spine join matched nothing and emptied the fact table). The api
-- table is therefore the single authoritative source. The source tables are
-- still only ever READ — never written.
--
-- No status filter (the api scrape has no lifecycle status — every captured row
-- is a real, scraped trip) and no revenue cap (all revenue consumed as-is).
-- Date window: fixed lower bound 2026-06-10 up to YESTERDAY (travel_date < today
-- in IST) — the current, still-accumulating day is never shown.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis._fact_trips` AS
WITH api_dedup AS (
  -- De-dup api to one row per (bus_id, travel_date, departure_time), keeping the
  -- latest scrape (pull_date DESC, then inserted_at DESC).
  SELECT * EXCEPT(_rn) FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY bus_id, travel_date, departure_time
        ORDER BY pull_date DESC, inserted_at DESC
      ) AS _rn
    FROM `drivn-project-1.dunamic_window_scrapper_redbus.redbus_scraper_api_based`
  )
  WHERE _rn = 1
)
SELECT
  -- identity (from the api scrape)
  a.bus_id,
  a.travel_date,
  a.departure_time,
  a.route_source,
  a.route_destination,
  a.operator_name,
  a.bus_type,
  a.arrival_time,
  -- api rows are captured/scraped trips; no lifecycle status is tracked here.
  CAST(NULL AS STRING)                                     AS status,

  -- scraped metrics
  a.pull_date,
  CAST(a.distance_km            AS FLOAT64)               AS distance_km,
  CAST(a.duration_hrs           AS FLOAT64)               AS duration_hrs,
  a.is_ev,
  CAST(a.total_seats            AS INT64)                 AS total_seats,
  CAST(a.booked_seats           AS INT64)                 AS booked_seats,
  CAST(a.available_seats        AS INT64)                 AS available_seats,
  CAST(a.occupancy_pct          AS FLOAT64)               AS occupancy_pct,
  CAST(a.seater_booked          AS INT64)                 AS seater_booked,
  CAST(a.seater_available       AS INT64)                 AS seater_available,
  CAST(a.sleeper_booked         AS INT64)                 AS sleeper_booked,
  CAST(a.sleeper_available      AS INT64)                 AS sleeper_available,
  CAST(a.booked_seater_revenue   AS FLOAT64)              AS booked_seater_revenue,
  CAST(a.available_seater_revenue AS FLOAT64)             AS available_seater_revenue,
  CAST(a.booked_sleeper_revenue  AS FLOAT64)              AS booked_sleeper_revenue,
  CAST(a.available_sleeper_revenue AS FLOAT64)            AS available_sleeper_revenue,
  CAST(a.price_inr              AS FLOAT64)               AS price_inr,
  -- Legacy scraped prices (avg_seater_price / avg_sleeper_price) are computed on
  -- AVAILABLE seats, so they overstate realised fares. We keep them for
  -- reference but the dashboard ASPs are now derived from BOOKED revenue below.
  CAST(a.avg_seater_price       AS FLOAT64)               AS avg_seater_price,
  CAST(a.avg_sleeper_price      AS FLOAT64)               AS avg_sleeper_price,
  -- NEW booked-revenue ASPs (data-quality fix, derived HERE — source untouched):
  --   booked_avg_seater_price  = booked_seater_revenue  / seater_booked
  --   booked_avg_sleeper_price = booked_sleeper_revenue / sleeper_booked
  --   booked_avg_price         = booked_revenue_inr      / (seater_booked + sleeper_booked)
  -- SAFE_DIVIDE returns NULL on a zero/NULL denominator so NULL-ignoring AVG/SUM
  -- skip rows with no booked seats of that class (correct — they have no ASP).
  SAFE_DIVIDE(CAST(a.booked_seater_revenue  AS FLOAT64),
              CAST(a.seater_booked  AS FLOAT64))           AS booked_avg_seater_price,
  SAFE_DIVIDE(CAST(a.booked_sleeper_revenue AS FLOAT64),
              CAST(a.sleeper_booked AS FLOAT64))           AS booked_avg_sleeper_price,
  SAFE_DIVIDE(CAST(a.booked_revenue_inr     AS FLOAT64),
              CAST(a.seater_booked AS FLOAT64) + CAST(a.sleeper_booked AS FLOAT64))
                                                           AS booked_avg_price,
  CAST(a.booked_revenue_inr     AS FLOAT64)               AS booked_revenue_inr,
  CAST(a.unrealised_revenue_inr AS FLOAT64)               AS unrealised_revenue_inr,
  CAST(a.operator_rating        AS FLOAT64)               AS operator_rating,
  CAST(a.operator_rating_count  AS INT64)                 AS operator_rating_count,
  a.unique_bus_id
FROM api_dedup a
WHERE a.travel_date >= DATE '2026-06-10'
  AND a.travel_date < CURRENT_DATE('Asia/Kolkata');


-- =============================================================================
-- 1b. mv_fact_grain — GRANULAR BASE for client-side filtered aggregation
-- =============================================================================
-- This is the single source the dashboard client aggregates from. It is grained
-- at (route × operator × travel_date × is_ev × bus_type) and carries ADDITIVE
-- components only — sums and count-accumulators — so the browser can re-derive
-- EVERY KPI (revenue, occupancy, ASPs, rev/km, rev/seat-km, EV split, fleet,
-- daily series) for ANY combination of route / operator / date-range filters by
-- simply summing the matching cells and dividing. Averages are reconstructed
-- from (sum, count) pairs so the result is exact, not an average-of-averages.
--
-- Non-additive note: unique_buses is COUNT(DISTINCT) PER CELL. Summing it across
-- cells over-counts a bus that runs on multiple dates/types — the client treats
-- the summed value as an upper-bound estimate (it is a secondary metric).
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_fact_grain` AS
SELECT
  -- dimensions
  CONCAT(route_source, ' -> ', route_destination)                  AS route,
  route_source                                                     AS src,
  route_destination                                                AS dst,
  operator_name,
  FORMAT_DATE('%Y-%m-%d', travel_date)                             AS date,
  -- hour-of-day from departure_time (powers the filterable hourly charts)
  SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\d{1,2}):') AS INT64) AS hr,
  is_ev,
  bus_type,
  COALESCE(CAST(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)) AS INT64), 0) AS km,

  -- additive counts
  COUNT(*)                                                         AS trips,
  COUNTIF(booked_revenue_inr IS NOT NULL)                          AS captured,
  COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,

  -- additive revenue / seats / distance
  SUM(booked_revenue_inr)                                          AS booked_revenue,
  SUM(unrealised_revenue_inr)                                      AS lost_revenue,
  SUM(total_seats)                                                 AS total_seats,
  SUM(booked_seats)                                                AS booked_seats,
  SUM(distance_km)                                                 AS total_km,
  SUM(distance_km * total_seats)                                   AS seat_km,
  SUM(seater_booked)                                               AS seater_booked,
  SUM(seater_available)                                            AS seater_available,
  SUM(sleeper_booked)                                              AS sleeper_booked,
  SUM(sleeper_available)                                           AS sleeper_available,
  SUM(distance_km * (seater_booked + seater_available))            AS seater_seat_km,
  SUM(distance_km * (sleeper_booked + sleeper_available))          AS sleeper_seat_km,
  SUM(booked_seater_revenue)                                       AS booked_seater_revenue,
  SUM(booked_sleeper_revenue)                                      AS booked_sleeper_revenue,

  -- average accumulators (sum + count → mean reconstructed client-side)
  SUM(occupancy_pct)                                               AS occ_sum,
  COUNTIF(occupancy_pct IS NOT NULL)                               AS occ_cnt,
  SUM(IF(duration_hrs > 0, duration_hrs, NULL))                    AS dur_sum,
  COUNTIF(duration_hrs > 0)                                        AS dur_cnt,
  SUM(IF(booked_avg_seater_price  > 0, booked_avg_seater_price,  NULL)) AS seater_price_sum,
  COUNTIF(booked_avg_seater_price  > 0)                            AS seater_price_cnt,
  SUM(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL)) AS sleeper_price_sum,
  COUNTIF(booked_avg_sleeper_price > 0)                            AS sleeper_price_cnt,
  SUM(IF(booked_avg_price > 0, booked_avg_price, NULL))            AS price_sum,
  COUNTIF(booked_avg_price > 0)                                    AS price_cnt,

  -- operator rating accumulators
  SUM(IF(operator_rating > 0, operator_rating, NULL))              AS rating_sum,
  COUNTIF(operator_rating > 0)                                     AS rating_cnt,
  MAX(IF(operator_rating_count > 0, operator_rating_count, NULL))  AS rating_count_max
FROM `drivn-project-1.dashboard_kpis._fact_trips`
GROUP BY route, src, dst, operator_name, date, hr, is_ev, bus_type;


-- =============================================================================
-- 2. mv_network_kpis — single row of network totals (Page 1 KPI tiles)
-- =============================================================================
-- DUAL-SOURCE per the KPI spec:
--   * Total trips, per-day trips, unique operators  -> CATALOG (the scheduled-
--     trip spine). The live catalog has NULL bus_id/status, so we de-dup on the
--     populated identity columns (route, operator, date, departure, bus_type)
--     to drop the route_id duplicate listings.
--   * Revenue, occupancy, ASPs, captured/coverage    -> API fact (_fact_trips).
--   * EV penetration: the spec wants this from the catalog, but the catalog has
--     NO is_ev column yet — so it is sourced from the API fact for now. Once an
--     is_ev column is added to redbus_today_catalog, move it to cat_agg.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_network_kpis` AS
WITH cat AS (
  SELECT route_source, route_destination, operator_name, travel_date, departure_time, bus_type
  FROM `drivn-project-1.dunamic_window_scrapper_redbus.redbus_today_catalog`
  WHERE travel_date >= DATE '2026-06-10'
    AND travel_date < CURRENT_DATE('Asia/Kolkata')
  GROUP BY route_source, route_destination, operator_name, travel_date, departure_time, bus_type
),
cat_agg AS (
  SELECT
    COUNT(*)                                                        AS total_trips,
    COUNT(DISTINCT operator_name)                                   AS total_operators,
    COUNT(DISTINCT CONCAT(route_source, ' -> ', route_destination)) AS total_routes,
    COUNT(DISTINCT travel_date)                                     AS n_days
  FROM cat
),
api_agg AS (
  SELECT
    COUNTIF(booked_revenue_inr IS NOT NULL)                         AS captured_trips,
    ROUND(SUM(booked_revenue_inr))                                  AS total_revenue,
    ROUND(SUM(unrealised_revenue_inr))                              AS total_lost_revenue,
    ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0))                                       AS avg_occupancy,
    COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,
    ROUND(AVG(IF(booked_avg_seater_price  > 0, booked_avg_seater_price,  NULL))) AS avg_seater_price,
    ROUND(AVG(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL))) AS avg_sleeper_price,
    ROUND(100.0 * COUNTIF(is_ev = TRUE) / NULLIF(COUNT(*), 0), 1)   AS ev_penetration_pct,
    SUM(booked_revenue_inr)                                         AS total_revenue_raw,
    -- ASPs = mean of per-trip booked ratios; Overall = the two weighted by booked seats.
    ROUND(AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked)))  AS seater_asp,
    ROUND(AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked))) AS sleeper_asp,
    ROUND(SAFE_DIVIDE(
        COALESCE(AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked)),  0) * SUM(seater_booked)
      + COALESCE(AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked)), 0) * SUM(sleeper_booked),
        NULLIF(SUM(seater_booked) + SUM(sleeper_booked), 0)))                   AS overall_asp
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
)
SELECT
  c.total_trips,
  a.captured_trips,
  ROUND(100.0 * a.captured_trips / NULLIF(c.total_trips, 0), 1)     AS coverage_pct,
  a.total_revenue,
  a.total_lost_revenue,
  a.avg_occupancy,
  c.total_routes,
  c.total_operators,
  a.unique_buses,
  c.n_days,
  a.avg_seater_price,
  a.avg_sleeper_price,
  a.ev_penetration_pct,
  a.seater_asp,
  a.sleeper_asp,
  a.overall_asp,
  -- per-day derived: trips from catalog spine, revenue from api, both / n_days
  ROUND(c.total_trips / NULLIF(c.n_days, 0))                        AS per_day_trips,
  ROUND(a.total_revenue_raw / NULLIF(c.n_days, 0))                  AS per_day_revenue,
  a.avg_occupancy                                                  AS per_day_occupancy
FROM cat_agg c CROSS JOIN api_agg a;


-- =============================================================================
-- 3. mv_route_summary — per-route summary (foundational)
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_summary` AS
SELECT
  CONCAT(route_source, ' -> ', route_destination)                   AS route,
  route_source                                                      AS src,
  route_destination                                                 AS dst,

  -- counts (catalog spine)
  COUNT(*)                                                          AS density,
  COUNTIF(booked_revenue_inr IS NOT NULL)                           AS captured,
  COUNT(DISTINCT operator_name)                                     AS operator_count,
  COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,
  COUNT(DISTINCT travel_date)                                       AS n_days,
  CASE
    WHEN COUNT(*) > 5000  THEN 'high'
    WHEN COUNT(*) >= 1000 THEN 'medium'
    ELSE 'low'
  END                                                               AS density_tier,

  -- distance — first non-null (will be 0 if no captured rows)
  COALESCE(CAST(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)) AS INT64), 0) AS km,

  -- revenue & occupancy (captured-only via NULL-ignoring AVG/SUM)
  ROUND(SUM(booked_revenue_inr))                                    AS total_rev,
  ROUND(SUM(unrealised_revenue_inr))                                AS lost_rev,
  ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0))                                         AS avg_occ,
  ROUND(AVG(duration_hrs), 2)                                       AS avg_trip_duration,

  -- Avg revenue / km = Σ(booked_revenue_inr) / (trips × km), where trips is the
  -- route's total trip count and km is the route distance (constant per route).
  -- This divides by ALL scheduled trips' distance, not just captured ones.
  COALESCE(ROUND(
    SUM(booked_revenue_inr)
    / NULLIF(COUNT(*) * ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)), 0)
  , 2), 0)                                                          AS rev_per_km,
  -- yieldPer100Km: Python uses max(km, 1) as fallback; when km=0, degenerates
  -- to total_rev * 100 / n.
  ROUND(
    IF(SUM(distance_km) > 0,
       SUM(booked_revenue_inr) / SUM(distance_km) * 100,
       SUM(booked_revenue_inr) / GREATEST(COUNT(*), 1) * 100)
  )                                                                 AS yield_per_100km,
  COALESCE(ROUND(SUM(booked_revenue_inr) / NULLIF(SUM(distance_km * total_seats), 0), 4), 0)
                                                                    AS rev_per_seat_km,
  COALESCE(ROUND(SUM(booked_seater_revenue)
       / NULLIF(SUM(distance_km * (seater_booked + seater_available)), 0), 2), 0)
                                                                    AS rev_per_seater_km,
  COALESCE(ROUND(SUM(booked_sleeper_revenue)
       / NULLIF(SUM(distance_km * (sleeper_booked + sleeper_available)), 0), 2), 0)
                                                                    AS rev_per_sleeper_km,
  COALESCE(ROUND(SUM(booked_revenue_inr) / NULLIF(SUM(booked_seats), 0)), 0)
                                                                    AS rev_per_yield,

  -- prices (captured >0)
  ROUND(AVG(IF(booked_avg_seater_price > 0, booked_avg_seater_price, NULL)))    AS avg_seater_price,
  ROUND(AVG(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL)))  AS avg_sleeper_price,
  -- ASPs = MEAN of per-trip booked ratios (booked_class_revenue / booked_class_seats).
  -- SAFE_DIVIDE → NULL when a trip booked no seats of that class, so those trips drop
  -- out of the AVG (a no-sleeper trip does NOT dilute the sleeper ASP toward 0).
  -- See docs/METRICS_Route_Report.md.
  ROUND(COALESCE(AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked)),  0))  AS seater_asp,
  ROUND(COALESCE(AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked)), 0))  AS sleeper_asp,
  -- Overall ASP = the two class ASPs weighted by total booked seats of each class
  -- = (seaterASP·Σseater_booked + sleeperASP·Σsleeper_booked) / Σ(all booked seats).
  ROUND(COALESCE(SAFE_DIVIDE(
      COALESCE(AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked)),  0) * SUM(seater_booked)
    + COALESCE(AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked)), 0) * SUM(sleeper_booked),
    NULLIF(SUM(seater_booked) + SUM(sleeper_booked), 0)), 0))                   AS overall_asp,

  -- EV / ICE — explicit TRUE/FALSE (NULL excluded from both, matches compute_route_block)
  COUNTIF(is_ev = TRUE)                                             AS ev_cnt,
  COUNTIF(is_ev = FALSE)                                            AS ice_cnt,
  ROUND(SUM(IF(is_ev = TRUE,  booked_revenue_inr, NULL)))           AS ev_rev,
  ROUND(SUM(IF(is_ev = FALSE, booked_revenue_inr, NULL)))           AS ice_rev,
  -- ev_pct: matches Python — uses total density as denom (treats NULL as not-EV)
  ROUND(100.0 * COUNTIF(is_ev = TRUE) / NULLIF(COUNT(*), 0))        AS ev_pct,

  -- per-class booked totals
  SUM(seater_booked)                                                AS seater_booked,
  SUM(sleeper_booked)                                               AS sleeper_booked,
  ROUND(SUM(booked_seater_revenue))                                 AS seater_rev,
  ROUND(SUM(booked_sleeper_revenue))                                AS sleeper_rev,

  -- projected monthly (per-day rev * 30)
  ROUND(SUM(booked_revenue_inr) / NULLIF(COUNT(DISTINCT travel_date), 0) * 30)
                                                                    AS proj_monthly,

  -- per-day derived
  ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT travel_date), 0))          AS per_day_trips,
  ROUND(SUM(booked_revenue_inr) / NULLIF(COUNT(DISTINCT travel_date), 0))
                                                                    AS per_day_revenue,
  ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0))                                         AS per_day_occupancy,

  -- Scrape efficiency (analyst-friendly: captured / scheduled)
  ROUND(100.0 * COUNTIF(booked_revenue_inr IS NOT NULL) / NULLIF(COUNT(*), 0))
                                                                    AS scrape_efficiency,
  -- Python utilizationByRoute uses occ >= 50 as "completed"
  COUNTIF(occupancy_pct >= 50)                                      AS completed_50pct,
  ROUND(100.0 * COUNTIF(occupancy_pct >= 50) / NULLIF(COUNT(*), 0)) AS efficiency_50pct
FROM `drivn-project-1.dashboard_kpis._fact_trips`
GROUP BY route, src, dst;


-- =============================================================================
-- 4. mv_peak_hours — 24-row hour-of-day chart (NULL occ → 0; matches Python)
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_peak_hours` AS
WITH hours AS (
  SELECT hr FROM UNNEST(GENERATE_ARRAY(0, 23)) AS hr
),
parsed AS (
  SELECT
    SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\d{1,2}):') AS INT64) AS hr,
    seater_booked, sleeper_booked, total_seats
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE departure_time IS NOT NULL
),
agg AS (
  SELECT hr, COUNT(*) AS cnt, ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)) AS avg_occ
  FROM parsed
  WHERE hr BETWEEN 0 AND 23
  GROUP BY hr
)
SELECT
  h.hr,
  CONCAT(CAST(h.hr AS STRING), ':00')                                AS label,
  COALESCE(a.cnt, 0)                                                 AS cnt,
  COALESCE(a.avg_occ, 0)                                             AS avg_occ
FROM hours h
LEFT JOIN agg a USING (hr);


-- =============================================================================
-- 5. mv_weekday_weekend — network-level 2-row split
-- =============================================================================
-- Network-level uses dilute-with-zero AVG (Python num() converts NULL to 0).
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_weekday_weekend` AS
SELECT
  -- BQ EXTRACT(DAYOFWEEK ...) returns 1=Sunday..7=Saturday
  IF(EXTRACT(DAYOFWEEK FROM travel_date) IN (1, 7), 'weekend', 'weekday') AS day_type,
  ROUND(SUM(booked_revenue_inr))                                    AS rev,
  ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)) AS avg_occ,
  COUNT(*)                                                          AS cnt,
  ROUND(SUM(booked_revenue_inr) / NULLIF(COUNT(*), 0))              AS rev_per_trip
FROM `drivn-project-1.dashboard_kpis._fact_trips`
WHERE travel_date IS NOT NULL
GROUP BY day_type;


-- =============================================================================
-- 6. mv_seasonality — daily network revenue series
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_seasonality` AS
SELECT
  FORMAT_DATE('%Y-%m-%d', travel_date)                              AS date,
  ROUND(SUM(booked_revenue_inr))                                    AS rev,
  COUNT(*)                                                          AS trips,
  ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0))                                         AS avg_occ
FROM `drivn-project-1.dashboard_kpis._fact_trips`
WHERE travel_date IS NOT NULL
GROUP BY date
ORDER BY date;


-- =============================================================================
-- 7. mv_utilization_buckets — occupancy histogram (NULL → 0 bucket, matches Python)
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_utilization_buckets` AS
WITH buckets AS (
  SELECT '0-20%'   AS bucket_range, 1 AS ord UNION ALL
  SELECT '21-40%', 2 UNION ALL
  SELECT '41-60%', 3 UNION ALL
  SELECT '61-80%', 4 UNION ALL
  SELECT '81-100%', 5
),
counts AS (
  SELECT
    CASE
      WHEN COALESCE(occupancy_pct, 0) <= 20 THEN '0-20%'
      WHEN COALESCE(occupancy_pct, 0) <= 40 THEN '21-40%'
      WHEN COALESCE(occupancy_pct, 0) <= 60 THEN '41-60%'
      WHEN COALESCE(occupancy_pct, 0) <= 80 THEN '61-80%'
      ELSE                                       '81-100%'
    END                                                              AS bucket_range,
    COUNT(*)                                                         AS cnt
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  GROUP BY bucket_range
)
SELECT
  -- `range` is a reserved keyword in BQ (RANGE type). The assembler renames
  -- this back to `range` when building the dashboard JSON.
  b.bucket_range                                                     AS bucket,
  b.ord,
  COALESCE(c.cnt, 0)                                                 AS cnt
FROM buckets b
LEFT JOIN counts c USING (bucket_range)
ORDER BY b.ord;


-- =============================================================================
-- 8. mv_dashboard_meta — single-row refresh metadata
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_dashboard_meta` AS
SELECT
  CURRENT_TIMESTAMP()                                                AS refreshed_at,
  (SELECT MAX(pull_date) FROM `drivn-project-1.dashboard_kpis._fact_trips`) AS last_pull,
  (SELECT FORMAT_DATE('%Y-%m-%d', MIN(travel_date)) FROM `drivn-project-1.dashboard_kpis._fact_trips`) AS window_start,
  (SELECT FORMAT_DATE('%Y-%m-%d', MAX(travel_date)) FROM `drivn-project-1.dashboard_kpis._fact_trips`) AS window_end,
  -- n_days (fix B5): how many distinct travel dates back the window. The window
  -- is thin/gappy (~5-6 days), so anything extrapolated to a month (projMonthly
  -- = per-day revenue × 30) rests on this few days — surface it so the UI can
  -- qualify the projection instead of reading it as a measured monthly figure.
  (SELECT COUNT(DISTINCT travel_date) FROM `drivn-project-1.dashboard_kpis._fact_trips`) AS n_days,
  (SELECT COUNT(*) FROM `drivn-project-1.dashboard_kpis._fact_trips`) AS scheduled_trips,
  (SELECT COUNTIF(booked_revenue_inr IS NOT NULL)
     FROM `drivn-project-1.dashboard_kpis._fact_trips`)              AS captured_trips;


-- =============================================================================
-- 9. mv_route_daily — per (route, date) series
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_daily` AS
SELECT
  CONCAT(route_source, ' -> ', route_destination)                    AS route,
  FORMAT_DATE('%Y-%m-%d', travel_date)                               AS date,
  ROUND(SUM(booked_seats))                                           AS demand,
  ROUND(SUM(total_seats))                                            AS supply,
  ROUND(SUM(booked_revenue_inr))                                     AS rev,
  ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0))                                          AS occ,
  COUNT(*)                                                           AS trips,
  ROUND(SUM(IF(is_ev = TRUE,  booked_revenue_inr, NULL)))            AS ev_rev,
  ROUND(SUM(IF(is_ev = FALSE, booked_revenue_inr, NULL)))            AS ice_rev,
  COALESCE(ROUND(100.0 * SUM(IF(is_ev = TRUE,  seater_booked + sleeper_booked, 0)) / NULLIF(SUM(IF(is_ev = TRUE,  total_seats, 0)), 0)), 0)    AS ev_occ,
  COALESCE(ROUND(100.0 * SUM(IF(is_ev = FALSE, seater_booked + sleeper_booked, 0)) / NULLIF(SUM(IF(is_ev = FALSE, total_seats, 0)), 0)), 0)    AS ice_occ
FROM `drivn-project-1.dashboard_kpis._fact_trips`
WHERE travel_date IS NOT NULL
GROUP BY route, travel_date;


-- =============================================================================
-- 10. mv_route_top_operators — top 6 operators per route by booked revenue
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_top_operators` AS
WITH per_op AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    operator_name                                                    AS op,
    COUNT(*)                                                         AS trips,
    SUM(booked_revenue_inr)                                          AS rev,
    COALESCE(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0), 0)                                  AS avg_occ,
    COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE operator_name IS NOT NULL
  GROUP BY route, operator_name
),
route_km AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    COALESCE(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)), 0) AS km
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  GROUP BY route
)
SELECT
  p.route,
  p.op,
  ROUND(COALESCE(p.rev, 0))                                          AS rev,
  p.trips,
  ROUND(p.avg_occ)                                                   AS avg_occ,
  p.unique_buses,
  IF(rk.km > 0,
     ROUND(p.rev / GREATEST(p.trips, 1) / rk.km, 2),
     0)                                                              AS rev_per_km,
  ROW_NUMBER() OVER (PARTITION BY p.route ORDER BY p.rev DESC NULLS LAST) AS rnk
FROM per_op p
LEFT JOIN route_km rk USING (route)
QUALIFY rnk <= 6;


-- =============================================================================
-- 11. mv_route_market_share — top 15 ops per route, composite weight
-- =============================================================================
-- Weighted blend: 50% revenue share + 30% trip share + 20% occupancy share,
-- normalized to percentages within the route. Matches Python compute_route_block.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_market_share` AS
WITH per_op AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    operator_name                                                    AS op,
    COUNT(*)                                                         AS trips,
    SUM(booked_revenue_inr)                                          AS rev,
    COALESCE(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0), 0)                                  AS avg_occ
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE operator_name IS NOT NULL
  GROUP BY route, operator_name
),
totals AS (
  SELECT
    route,
    SUM(trips)                                                       AS total_trips,
    COALESCE(NULLIF(SUM(rev), 0), 1)                                 AS total_op_rev
  FROM per_op
  GROUP BY route
),
composite AS (
  SELECT
    p.route, p.op, p.trips, p.rev, p.avg_occ,
    (0.5 * (COALESCE(p.rev, 0) / t.total_op_rev)
     + 0.3 * (p.trips / GREATEST(t.total_trips, 1))
     + 0.2 * (p.avg_occ / 100.0))                                    AS comp_score
  FROM per_op p
  JOIN totals t USING (route)
)
SELECT
  route, op,
  ROUND(comp_score / NULLIF(SUM(comp_score) OVER (PARTITION BY route), 0) * 100)
                                                                     AS pct,
  trips,
  ROUND(COALESCE(rev, 0))                                            AS rev,
  ROUND(avg_occ)                                                     AS avg_occ,
  ROW_NUMBER() OVER (PARTITION BY route ORDER BY comp_score DESC)    AS rnk
FROM composite
QUALIFY rnk <= 15;


-- =============================================================================
-- 12. mv_route_bus_configs — top 6 bus types per route
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_bus_configs` AS
WITH counts AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    bus_type                                                         AS type,
    COUNT(*)                                                         AS cnt
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE bus_type IS NOT NULL
  GROUP BY route, bus_type
)
SELECT
  route, type, cnt,
  ROW_NUMBER() OVER (PARTITION BY route ORDER BY cnt DESC, type ASC) AS rnk
FROM counts
QUALIFY rnk <= 6;


-- =============================================================================
-- 13. mv_route_hourly — per (route, hour) occupancy (dilute with zero like network)
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_hourly` AS
WITH routes AS (
  SELECT DISTINCT CONCAT(route_source, ' -> ', route_destination)    AS route
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
),
hours AS (SELECT hr FROM UNNEST(GENERATE_ARRAY(0, 23)) AS hr),
parsed AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\d{1,2}):') AS INT64) AS hr,
    seater_booked, sleeper_booked, total_seats
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE departure_time IS NOT NULL
),
agg AS (
  SELECT route, hr, ROUND(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)) AS avg_occ
  FROM parsed
  WHERE hr BETWEEN 0 AND 23
  GROUP BY route, hr
)
SELECT
  r.route, h.hr,
  COALESCE(a.avg_occ, 0)                                             AS avg_occ
FROM routes r
CROSS JOIN hours h
LEFT JOIN agg a USING (route, hr);


-- =============================================================================
-- 14. mv_route_weekday_weekend — per-route DOW split (cross-joined for both rows)
-- =============================================================================
-- Per-route uses ignore-NULL AVG (matches Python weekday_weekend_split).
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_weekday_weekend` AS
WITH routes AS (
  SELECT DISTINCT CONCAT(route_source, ' -> ', route_destination)    AS route
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
),
types AS (SELECT day_type FROM UNNEST(['weekday','weekend']) AS day_type),
agg AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                  AS route,
    IF(EXTRACT(DAYOFWEEK FROM travel_date) IN (1, 7), 'weekend', 'weekday') AS day_type,
    SUM(booked_revenue_inr)                                          AS rev,
    100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)                                               AS avg_occ,
    COUNT(*)                                                         AS trips
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE travel_date IS NOT NULL
  GROUP BY route, day_type
)
SELECT
  r.route,
  t.day_type,
  ROUND(COALESCE(a.rev, 0))                                          AS rev,
  ROUND(COALESCE(a.avg_occ, 0))                                      AS avg_occ,
  COALESCE(a.trips, 0)                                               AS trips,
  ROUND(COALESCE(a.rev, 0) / NULLIF(COALESCE(a.trips, 0), 0))        AS rev_per_trip
FROM routes r
CROSS JOIN types t
LEFT JOIN agg a USING (route, day_type);


-- =============================================================================
-- 15. mv_operator_summary — per-operator (>= 10 trips) overall stats
-- =============================================================================
-- Python compute_op_stats treats NULL is_ev as ICE (uses ~ev_mask), distinct
-- from compute_route_block which excludes NULL from both. Match operator
-- behavior: ice_cnt = total - ev_cnt.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_summary` AS
WITH op_agg AS (
  SELECT
    operator_name,
    COUNT(*)                                                         AS trips,
    SUM(booked_revenue_inr)                                          AS total_rev,
    100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)                                               AS avg_occ,
    SUM(distance_km)                                                 AS total_km,
    SUM(total_seats)                                                 AS total_seats,
    SUM(booked_seats)                                                AS total_booked,
    SUM(seater_booked)                                               AS seater_booked,
    SUM(sleeper_booked)                                              AS sleeper_booked,
    SUM(booked_seater_revenue)                                       AS seater_rev,
    SUM(booked_sleeper_revenue)                                      AS sleeper_rev,
    -- total physical seats per class (for capacity ASPs)
    SUM(seater_booked  + seater_available)                           AS total_seater_seats,
    SUM(sleeper_booked + sleeper_available)                          AS total_sleeper_seats,
    -- Capacity seat-km denominators (match local: Σ(distance × seats))
    SUM(distance_km * total_seats)                                   AS seat_km,
    SUM(distance_km * (seater_booked + seater_available))            AS seater_seat_km,
    SUM(distance_km * (sleeper_booked + sleeper_available))          AS sleeper_seat_km,
    COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,
    AVG(duration_hrs)                                                AS avg_duration,
    COUNTIF(is_ev = TRUE)                                            AS ev_cnt,
    SUM(IF(is_ev = TRUE, booked_revenue_inr, NULL))                  AS ev_rev,
    AVG(IF(operator_rating       > 0, operator_rating,       NULL))  AS rating_raw,
    MAX(IF(operator_rating_count > 0, operator_rating_count, NULL))  AS rating_count_raw,
    AVG(IF(booked_avg_seater_price > 0, booked_avg_seater_price, NULL))          AS avg_seater_price_raw,
    AVG(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL))          AS avg_sleeper_price_raw,
    -- ASPs = mean of per-trip booked ratios (rev ÷ booked seats of that class)
    AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked))                      AS seater_asp_raw,
    AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked))                     AS sleeper_asp_raw
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE operator_name IS NOT NULL
  GROUP BY operator_name
  HAVING COUNT(*) >= 10
),
network AS (
  SELECT SUM(booked_revenue_inr) AS total_rev_all
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
),
-- Σ(trips_route × km_route) per operator: km is constant within a route, so we
-- compute trips × km per (operator, route) then sum. This is the multi-route
-- generalization of revPerKm = Σrev / (trips × km) — each route contributes its
-- own km, so the figure follows route mix exactly.
op_trip_km AS (
  SELECT operator_name, SUM(route_trip_km) AS trip_km
  FROM (
    SELECT
      operator_name,
      COUNT(*) * COALESCE(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)), 0) AS route_trip_km
    FROM `drivn-project-1.dashboard_kpis._fact_trips`
    WHERE operator_name IS NOT NULL
    GROUP BY operator_name, route_source, route_destination
  )
  GROUP BY operator_name
)
SELECT
  o.operator_name,
  o.trips,
  ROUND(COALESCE(o.total_rev, 0))                                    AS total_rev,
  ROUND(COALESCE(o.avg_occ, 0))                                      AS avg_occ,
  ROUND(COALESCE(o.total_km, 0))                                     AS total_km,
  ROUND(COALESCE(o.total_seats, 0))                                  AS total_seats,
  ROUND(COALESCE(o.total_booked, 0))                                 AS total_booked,
  ROUND(COALESCE(o.seater_booked, 0))                                AS seater_booked,
  ROUND(COALESCE(o.sleeper_booked, 0))                               AS sleeper_booked,
  -- Avg revenue / km = Σrev / Σ(trips_route × km_route) (see op_trip_km CTE).
  IF(COALESCE(tk.trip_km, 0) > 0,
     ROUND(o.total_rev / tk.trip_km, 2), 0)                          AS rev_per_km,
  IF(COALESCE(o.seat_km, 0) > 0,
     ROUND(o.total_rev / o.seat_km, 4), 0)                           AS rev_per_seat_km,
  IF(COALESCE(o.seater_seat_km, 0) > 0,
     ROUND(o.seater_rev / o.seater_seat_km, 2), 0)                   AS rev_per_seater_km,
  IF(COALESCE(o.sleeper_seat_km, 0) > 0,
     ROUND(o.sleeper_rev / o.sleeper_seat_km, 2), 0)                 AS rev_per_sleeper_km,
  IF(COALESCE(o.total_km, 0) > 0,
     ROUND(o.total_rev / o.trips / (o.total_km / o.trips) * 100), 0)
                                                                     AS yield_per_100km,
  IF(COALESCE(o.total_booked, 0) > 0,
     ROUND(o.total_rev / o.total_booked), 0)                         AS rev_per_yield,
  ROUND(COALESCE(o.avg_seater_price_raw, 0))                         AS avg_seater_price,
  ROUND(COALESCE(o.avg_sleeper_price_raw, 0))                        AS avg_sleeper_price,
  -- ASPs = mean of per-trip booked ratios; Overall = the two weighted by booked seats.
  ROUND(COALESCE(o.seater_asp_raw, 0))                               AS seater_asp,
  ROUND(COALESCE(o.sleeper_asp_raw, 0))                              AS sleeper_asp,
  ROUND(COALESCE(SAFE_DIVIDE(
      COALESCE(o.seater_asp_raw, 0) * o.seater_booked
    + COALESCE(o.sleeper_asp_raw, 0) * o.sleeper_booked,
    NULLIF(o.seater_booked + o.sleeper_booked, 0)), 0))              AS overall_asp,
  ROUND(COALESCE(o.avg_duration, 0), 2)                              AS avg_trip_duration,
  o.ev_cnt,
  o.trips - o.ev_cnt                                                 AS ice_cnt,
  ROUND(COALESCE(o.ev_rev, 0))                                       AS ev_rev,
  ROUND(COALESCE(o.total_rev - COALESCE(o.ev_rev, 0), 0))            AS ice_rev,
  o.unique_buses,
  ROUND(COALESCE(o.rating_raw, 0), 2)                                AS rating,
  CAST(COALESCE(o.rating_count_raw, 0) AS INT64)                     AS rating_count,
  ROUND(COALESCE(o.total_rev, 0) / NULLIF((SELECT total_rev_all FROM network), 0) * 100, 3)
                                                                     AS network_share_pct,
  ROW_NUMBER() OVER (ORDER BY COALESCE(o.total_rev, 0) DESC)         AS market_rank
FROM op_agg o
LEFT JOIN op_trip_km tk USING (operator_name);


-- =============================================================================
-- 16. mv_operator_route_breakdown — per (operator, route) detail
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_route_breakdown` AS
WITH op_route_agg AS (
  SELECT
    m.operator_name,
    CONCAT(m.route_source, ' -> ', m.route_destination)              AS route,
    COUNT(*)                                                         AS trips,
    SUM(m.booked_revenue_inr)                                        AS total_rev,
    100.0 * SUM(m.seater_booked + m.sleeper_booked) / NULLIF(SUM(m.total_seats), 0)                                             AS avg_occ,
    SUM(m.distance_km)                                               AS total_km,
    SUM(m.total_seats)                                               AS total_seats,
    SUM(m.booked_seats)                                              AS total_booked,
    SUM(m.seater_booked)                                             AS seater_booked,
    SUM(m.sleeper_booked)                                            AS sleeper_booked,
    SUM(m.booked_seater_revenue)                                     AS seater_rev,
    SUM(m.booked_sleeper_revenue)                                    AS sleeper_rev,
    -- total physical seats per class (for capacity ASPs)
    SUM(m.seater_booked  + m.seater_available)                       AS total_seater_seats,
    SUM(m.sleeper_booked + m.sleeper_available)                      AS total_sleeper_seats,
    SUM(m.distance_km * m.total_seats)                               AS seat_km,
    SUM(m.distance_km * (m.seater_booked + m.seater_available))      AS seater_seat_km,
    SUM(m.distance_km * (m.sleeper_booked + m.sleeper_available))    AS sleeper_seat_km,
    -- route km (constant within this operator+route) for revPerKm = Σrev/(trips×km)
    COALESCE(ANY_VALUE(IF(m.distance_km IS NOT NULL, m.distance_km, NULL)), 0) AS km,
    COUNT(DISTINCT IF(m.unique_bus_id IS NOT NULL, m.unique_bus_id, NULL)) AS unique_buses,
    AVG(m.duration_hrs)                                              AS avg_duration,
    COUNTIF(m.is_ev = TRUE)                                          AS ev_cnt,
    SUM(IF(m.is_ev = TRUE, m.booked_revenue_inr, NULL))              AS ev_rev,
    AVG(IF(m.booked_avg_seater_price  > 0, m.booked_avg_seater_price,  NULL))  AS avg_seater_price_raw,
    AVG(IF(m.booked_avg_sleeper_price > 0, m.booked_avg_sleeper_price, NULL))  AS avg_sleeper_price_raw,
    -- ASPs = mean of per-trip booked ratios (rev ÷ booked seats of that class)
    AVG(SAFE_DIVIDE(m.booked_seater_revenue,  m.seater_booked))                AS seater_asp_raw,
    AVG(SAFE_DIVIDE(m.booked_sleeper_revenue, m.sleeper_booked))               AS sleeper_asp_raw
  FROM `drivn-project-1.dashboard_kpis._fact_trips` m
  INNER JOIN `drivn-project-1.dashboard_kpis.mv_operator_summary` s
    USING (operator_name)
  GROUP BY m.operator_name, route
)
SELECT
  operator_name, route,
  trips,
  ROUND(COALESCE(total_rev, 0))                                      AS total_rev,
  ROUND(COALESCE(avg_occ, 0))                                        AS avg_occ,
  ROUND(COALESCE(total_km, 0))                                       AS total_km,
  ROUND(COALESCE(seater_booked, 0))                                  AS seater_booked,
  ROUND(COALESCE(sleeper_booked, 0))                                 AS sleeper_booked,
  -- Avg revenue / km = Σrev / (trips × km), km = this route's distance.
  IF(COALESCE(trips * km, 0) > 0,
     ROUND(total_rev / (trips * km), 2), 0)                          AS rev_per_km,
  IF(COALESCE(seat_km, 0) > 0,
     ROUND(total_rev / seat_km, 4), 0)                              AS rev_per_seat_km,
  IF(COALESCE(seater_seat_km, 0) > 0,
     ROUND(seater_rev / seater_seat_km, 2), 0)                      AS rev_per_seater_km,
  IF(COALESCE(sleeper_seat_km, 0) > 0,
     ROUND(sleeper_rev / sleeper_seat_km, 2), 0)                    AS rev_per_sleeper_km,
  IF(COALESCE(total_km, 0) > 0,
     ROUND(total_rev / trips / (total_km / trips) * 100), 0)         AS yield_per_100km,
  IF(COALESCE(total_booked, 0) > 0,
     ROUND(total_rev / total_booked), 0)                             AS rev_per_yield,
  ROUND(COALESCE(avg_seater_price_raw, 0))                           AS avg_seater_price,
  ROUND(COALESCE(avg_sleeper_price_raw, 0))                          AS avg_sleeper_price,
  -- ASPs = mean of per-trip booked ratios; Overall = the two weighted by booked seats.
  ROUND(COALESCE(seater_asp_raw, 0))                                 AS seater_asp,
  ROUND(COALESCE(sleeper_asp_raw, 0))                                AS sleeper_asp,
  ROUND(COALESCE(SAFE_DIVIDE(
      COALESCE(seater_asp_raw, 0) * seater_booked
    + COALESCE(sleeper_asp_raw, 0) * sleeper_booked,
    NULLIF(seater_booked + sleeper_booked, 0)), 0))                  AS overall_asp,
  ROUND(COALESCE(avg_duration, 0), 2)                                AS avg_trip_duration,
  ev_cnt,
  trips - ev_cnt                                                     AS ice_cnt,
  ROUND(COALESCE(ev_rev, 0))                                         AS ev_rev,
  ROUND(COALESCE(total_rev - COALESCE(ev_rev, 0), 0))                AS ice_rev,
  unique_buses
FROM op_route_agg;


-- =============================================================================
-- 16b. mv_operator_route_daily — per (operator, route, date) series
-- =============================================================================
-- Powers the operator page's route-filtered Revenue/Occupancy trends. Matches
-- the per-route daily series generate_data.py attaches to operator.routes[route].
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_route_daily` AS
SELECT
  m.operator_name,
  CONCAT(m.route_source, ' -> ', m.route_destination)               AS route,
  FORMAT_DATE('%Y-%m-%d', m.travel_date)                            AS date,
  ROUND(SUM(m.booked_revenue_inr))                                  AS rev,
  ROUND(100.0 * SUM(m.seater_booked + m.sleeper_booked) / NULLIF(SUM(m.total_seats), 0))                                       AS occ,
  COUNT(*)                                                          AS trips
FROM `drivn-project-1.dashboard_kpis._fact_trips` m
INNER JOIN `drivn-project-1.dashboard_kpis.mv_operator_summary` s USING (operator_name)
WHERE m.travel_date IS NOT NULL
GROUP BY m.operator_name, route, date;


-- =============================================================================
-- 16c. mv_operator_route_fleet — top 6 bus types per (operator, route)
-- =============================================================================
-- Powers the operator page's route-filtered Fleet Composition.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_route_fleet` AS
WITH counts AS (
  SELECT
    m.operator_name,
    CONCAT(m.route_source, ' -> ', m.route_destination)             AS route,
    m.bus_type                                                      AS type,
    COUNT(*)                                                        AS cnt
  FROM `drivn-project-1.dashboard_kpis._fact_trips` m
  INNER JOIN `drivn-project-1.dashboard_kpis.mv_operator_summary` s USING (operator_name)
  WHERE m.bus_type IS NOT NULL
  GROUP BY m.operator_name, route, m.bus_type
)
SELECT
  operator_name, route, type, cnt,
  ROW_NUMBER() OVER (PARTITION BY operator_name, route ORDER BY cnt DESC, type ASC) AS rnk
FROM counts
QUALIFY rnk <= 6;


-- =============================================================================
-- 17. mv_operator_daily — per (operator, date) series
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_daily` AS
SELECT
  m.operator_name,
  FORMAT_DATE('%Y-%m-%d', m.travel_date)                             AS date,
  ROUND(SUM(m.booked_revenue_inr))                                   AS rev,
  ROUND(100.0 * SUM(m.seater_booked + m.sleeper_booked) / NULLIF(SUM(m.total_seats), 0))                                        AS occ,
  COUNT(*)                                                           AS trips
FROM `drivn-project-1.dashboard_kpis._fact_trips` m
INNER JOIN `drivn-project-1.dashboard_kpis.mv_operator_summary` s USING (operator_name)
WHERE m.travel_date IS NOT NULL
GROUP BY m.operator_name, date;


-- =============================================================================
-- 18. mv_operator_fleet — top 6 bus types per operator
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_fleet` AS
WITH counts AS (
  SELECT
    m.operator_name,
    m.bus_type                                                       AS type,
    COUNT(*)                                                         AS cnt
  FROM `drivn-project-1.dashboard_kpis._fact_trips` m
  INNER JOIN `drivn-project-1.dashboard_kpis.mv_operator_summary` s USING (operator_name)
  WHERE m.bus_type IS NOT NULL
  GROUP BY m.operator_name, m.bus_type
)
SELECT
  operator_name, type, cnt,
  ROW_NUMBER() OVER (PARTITION BY operator_name ORDER BY cnt DESC, type ASC) AS rnk
FROM counts
QUALIFY rnk <= 6;


-- =============================================================================
-- 19. mv_operator_weekday_weekend — per-operator DOW split
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_operator_weekday_weekend` AS
WITH ops AS (
  SELECT operator_name FROM `drivn-project-1.dashboard_kpis.mv_operator_summary`
),
types AS (SELECT day_type FROM UNNEST(['weekday','weekend']) AS day_type),
agg AS (
  SELECT
    m.operator_name,
    IF(EXTRACT(DAYOFWEEK FROM m.travel_date) IN (1, 7), 'weekend', 'weekday') AS day_type,
    SUM(m.booked_revenue_inr)                                        AS rev,
    100.0 * SUM(m.seater_booked + m.sleeper_booked) / NULLIF(SUM(m.total_seats), 0)                                             AS avg_occ,
    COUNT(*)                                                         AS trips
  FROM `drivn-project-1.dashboard_kpis._fact_trips` m
  INNER JOIN ops o USING (operator_name)
  WHERE m.travel_date IS NOT NULL
  GROUP BY m.operator_name, day_type
)
SELECT
  o.operator_name, t.day_type,
  ROUND(COALESCE(a.rev, 0))                                          AS rev,
  ROUND(COALESCE(a.avg_occ, 0))                                      AS avg_occ,
  COALESCE(a.trips, 0)                                               AS trips,
  ROUND(COALESCE(a.rev, 0) / NULLIF(COALESCE(a.trips, 0), 0))        AS rev_per_trip
FROM ops o
CROSS JOIN types t
LEFT JOIN agg a USING (operator_name, day_type);


-- =============================================================================
-- 20. mv_ev_ice — 2-row EV vs ICE summary
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_ev_ice` AS
WITH types AS (SELECT type FROM UNNEST(['ev','ice']) AS type),
agg AS (
  SELECT
    IF(is_ev = TRUE, 'ev', 'ice')                                    AS type,
    COUNT(*)                                                         AS cnt,
    SUM(booked_revenue_inr)                                          AS total_rev,
    100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)                                               AS avg_occ,
    SUM(distance_km)                                                 AS total_km,
    SUM(total_seats)                                                 AS total_seats,
    SUM(booked_seats)                                                AS total_booked,
    SUM(seater_booked)                                               AS seater_booked,
    SUM(sleeper_booked)                                              AS sleeper_booked,
    SUM(booked_seater_revenue)                                       AS seater_rev,
    SUM(booked_sleeper_revenue)                                      AS sleeper_rev,
    -- total physical seats per class (for capacity ASPs)
    SUM(seater_booked  + seater_available)                           AS total_seater_seats,
    SUM(sleeper_booked + sleeper_available)                          AS total_sleeper_seats,
    -- capacity seat-km (Σ distance × (booked+available)) — same basis as the
    -- route/operator MVs, so EV/ICE rev/seater/km is now comparable to them.
    SUM(distance_km * (seater_booked + seater_available))            AS seater_seat_km,
    SUM(distance_km * (sleeper_booked + sleeper_available))          AS sleeper_seat_km,
    COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,
    AVG(IF(duration_hrs > 0, duration_hrs, NULL))                    AS avg_duration,
    AVG(IF(booked_avg_seater_price > 0, booked_avg_seater_price, NULL))          AS avg_seater_price_raw,
    AVG(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL))          AS avg_sleeper_price_raw,
    -- ASPs = mean of per-trip booked ratios (rev ÷ booked seats of that class)
    AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked))                      AS seater_asp_raw,
    AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked))                     AS sleeper_asp_raw
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE is_ev IS NOT NULL
  GROUP BY type
),
-- Σ(trips_route × km_route) per type, for revPerKm = Σrev / (trips × km).
type_trip_km AS (
  SELECT type, SUM(route_trip_km) AS trip_km
  FROM (
    SELECT
      IF(is_ev = TRUE, 'ev', 'ice')                                  AS type,
      COUNT(*) * COALESCE(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)), 0) AS route_trip_km
    FROM `drivn-project-1.dashboard_kpis._fact_trips`
    WHERE is_ev IS NOT NULL
    GROUP BY type, route_source, route_destination
  )
  GROUP BY type
)
SELECT
  t.type,
  ROUND(COALESCE(a.total_rev, 0))                                    AS rev,
  COALESCE(a.cnt, 0)                                                 AS cnt,
  COALESCE(a.unique_buses, 0)                                        AS unique_buses,
  ROUND(COALESCE(a.avg_occ, 0))                                      AS avg_occ,
  ROUND(COALESCE(a.total_seats, 0))                                  AS seats,
  ROUND(COALESCE(a.total_booked, 0))                                 AS booked,
  ROUND(COALESCE(a.avg_duration, 0), 2)                              AS avg_duration,
  ROUND(COALESCE(a.avg_duration, 0) * 2, 2)                          AS round_trip_time,
  ROUND(COALESCE(a.avg_seater_price_raw, 0))                         AS avg_seater_price,
  ROUND(COALESCE(a.avg_sleeper_price_raw, 0))                        AS avg_sleeper_price,
  -- Avg revenue / km = Σrev / Σ(trips_route × km_route) (see type_trip_km).
  IF(COALESCE(tk.trip_km, 0) > 0, ROUND(a.total_rev / tk.trip_km, 2), 0)
                                                                     AS rev_per_km,
  IF(COALESCE(a.total_km, 0) > 0 AND a.total_km / GREATEST(a.cnt, 1) >= 1,
     ROUND(a.total_rev / a.total_km * 100),
     ROUND(COALESCE(a.total_rev, 0) / GREATEST(a.cnt, 1) * 100))     AS yield_per_100km,
  -- Rev / seater / km = Σ(booked_seater_revenue) / Σ(distance × (booked+available)).
  IF(COALESCE(a.seater_seat_km, 0) > 0,
     ROUND(a.seater_rev / a.seater_seat_km, 2), 0)                   AS rev_per_seater_km,
  IF(COALESCE(a.sleeper_seat_km, 0) > 0,
     ROUND(a.sleeper_rev / a.sleeper_seat_km, 2), 0)                 AS rev_per_sleeper_km,
  -- ASPs = mean of per-trip booked ratios; Overall = the two weighted by booked seats.
  ROUND(COALESCE(a.seater_asp_raw, 0))                                                         AS seater_asp,
  ROUND(COALESCE(a.sleeper_asp_raw, 0))                                                        AS sleeper_asp,
  ROUND(COALESCE(SAFE_DIVIDE(
      COALESCE(a.seater_asp_raw, 0) * a.seater_booked
    + COALESCE(a.sleeper_asp_raw, 0) * a.sleeper_booked,
    NULLIF(a.seater_booked + a.sleeper_booked, 0)), 0))                                        AS overall_asp
FROM types t
LEFT JOIN agg a USING (type)
LEFT JOIN type_trip_km tk USING (type);


-- =============================================================================
-- 20b. mv_route_ev_ice — per (route, EV/ICE) summary (powers Page 4 route filter)
-- =============================================================================
-- Same seat-km basis as mv_ev_ice, but grouped by route so the EV/ICE page can
-- scope Rev/KM, Rev/Seater/KM and Rev/Sleeper/KM to the selected route. km is
-- constant within a route, so revPerKm = Σrev / (trips × km) is exact here.
-- Cross-joined against {ev,ice} so every route always has both rows.
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_route_ev_ice` AS
WITH routes AS (
  SELECT DISTINCT CONCAT(route_source, ' -> ', route_destination)  AS route
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
),
types AS (SELECT type FROM UNNEST(['ev','ice']) AS type),
agg AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination)                AS route,
    IF(is_ev = TRUE, 'ev', 'ice')                                  AS type,
    COUNT(*)                                                       AS cnt,
    SUM(booked_revenue_inr)                                        AS total_rev,
    100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0)                                             AS avg_occ,
    SUM(total_seats)                                               AS total_seats,
    SUM(booked_seats)                                              AS total_booked,
    SUM(booked_seater_revenue)                                     AS seater_rev,
    SUM(booked_sleeper_revenue)                                    AS sleeper_rev,
    SUM(distance_km * (seater_booked + seater_available))          AS seater_seat_km,
    SUM(distance_km * (sleeper_booked + sleeper_available))        AS sleeper_seat_km,
    -- total physical seats per class (for capacity ASPs)
    SUM(seater_booked  + seater_available)                         AS total_seater_seats,
    SUM(sleeper_booked + sleeper_available)                        AS total_sleeper_seats,
    COUNT(DISTINCT IF(unique_bus_id IS NOT NULL, unique_bus_id, NULL)) AS unique_buses,
    AVG(IF(duration_hrs > 0, duration_hrs, NULL))                  AS avg_duration,
    AVG(IF(booked_avg_seater_price > 0, booked_avg_seater_price, NULL))        AS avg_seater_price_raw,
    AVG(IF(booked_avg_sleeper_price > 0, booked_avg_sleeper_price, NULL))      AS avg_sleeper_price_raw,
    -- ASPs = mean of per-trip booked ratios; booked seat sums weight the Overall ASP
    AVG(SAFE_DIVIDE(booked_seater_revenue,  seater_booked))                    AS seater_asp_raw,
    AVG(SAFE_DIVIDE(booked_sleeper_revenue, sleeper_booked))                   AS sleeper_asp_raw,
    SUM(seater_booked)                                                        AS seater_booked,
    SUM(sleeper_booked)                                                       AS sleeper_booked,
    COALESCE(ANY_VALUE(IF(distance_km IS NOT NULL, distance_km, NULL)), 0) AS km
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE is_ev IS NOT NULL
  GROUP BY route, type
)
SELECT
  r.route,
  t.type,
  ROUND(COALESCE(a.total_rev, 0))                                  AS rev,
  COALESCE(a.cnt, 0)                                               AS cnt,
  COALESCE(a.unique_buses, 0)                                      AS unique_buses,
  ROUND(COALESCE(a.avg_occ, 0))                                    AS avg_occ,
  ROUND(COALESCE(a.total_seats, 0))                                AS seats,
  ROUND(COALESCE(a.total_booked, 0))                               AS booked,
  ROUND(COALESCE(a.avg_duration, 0), 2)                            AS avg_duration,
  ROUND(COALESCE(a.avg_duration, 0) * 2, 2)                        AS round_trip_time,
  ROUND(COALESCE(a.avg_seater_price_raw, 0))                       AS avg_seater_price,
  ROUND(COALESCE(a.avg_sleeper_price_raw, 0))                      AS avg_sleeper_price,
  IF(COALESCE(a.cnt * a.km, 0) > 0,
     ROUND(a.total_rev / (a.cnt * a.km), 2), 0)                    AS rev_per_km,
  IF(COALESCE(a.seater_seat_km, 0) > 0,
     ROUND(a.seater_rev / a.seater_seat_km, 2), 0)                 AS rev_per_seater_km,
  IF(COALESCE(a.sleeper_seat_km, 0) > 0,
     ROUND(a.sleeper_rev / a.sleeper_seat_km, 2), 0)               AS rev_per_sleeper_km,
  -- ASPs = mean of per-trip booked ratios; Overall = the two weighted by booked seats.
  ROUND(COALESCE(a.seater_asp_raw, 0))                                                         AS seater_asp,
  ROUND(COALESCE(a.sleeper_asp_raw, 0))                                                        AS sleeper_asp,
  ROUND(COALESCE(SAFE_DIVIDE(
      COALESCE(a.seater_asp_raw, 0) * a.seater_booked
    + COALESCE(a.sleeper_asp_raw, 0) * a.sleeper_booked,
    NULLIF(a.seater_booked + a.sleeper_booked, 0)), 0))                                        AS overall_asp
FROM routes r
CROSS JOIN types t
LEFT JOIN agg a USING (route, type);


-- =============================================================================
-- 21. mv_ev_ice_bus_configs — top 6 bus types per EV/ICE
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_ev_ice_bus_configs` AS
WITH counts AS (
  SELECT
    IF(is_ev = TRUE, 'ev', 'ice')                                    AS type,
    bus_type,
    COUNT(*)                                                         AS cnt
  FROM `drivn-project-1.dashboard_kpis._fact_trips`
  WHERE is_ev IS NOT NULL AND bus_type IS NOT NULL
  GROUP BY type, bus_type
)
SELECT
  type, bus_type, cnt,
  ROW_NUMBER() OVER (PARTITION BY type ORDER BY cnt DESC, bus_type ASC) AS rnk
FROM counts
QUALIFY rnk <= 6;


-- =============================================================================
-- 22. mv_ev_ice_daily — per (type, date) series
-- =============================================================================
CREATE OR REPLACE TABLE `drivn-project-1.dashboard_kpis.mv_ev_ice_daily` AS
SELECT
  IF(is_ev = TRUE, 'ev', 'ice')                                      AS type,
  FORMAT_DATE('%Y-%m-%d', travel_date)                               AS date,
  ROUND(COALESCE(SUM(booked_seats), 0))                              AS demand,
  ROUND(COALESCE(SUM(booked_revenue_inr), 0))                        AS rev,
  ROUND(COALESCE(100.0 * SUM(seater_booked + sleeper_booked) / NULLIF(SUM(total_seats), 0), 0))                             AS occ
FROM `drivn-project-1.dashboard_kpis._fact_trips`
WHERE is_ev IS NOT NULL AND travel_date IS NOT NULL
GROUP BY type, travel_date;


-- =============================================================================
-- HOW TO SCHEDULE THE DAILY REFRESH
-- =============================================================================
-- 1. Run this whole file once in the BQ SQL Editor to seed the tables.
-- 2. In the BQ Console, click "Schedule" -> "Create new scheduled query".
-- 3. Settings:
--    Name:                  Daily KPI refresh
--    Region:                US (same as data)
--    Repeats:               Daily, 06:00 IST (which is 00:30 UTC)
--    Query:                 paste sections 1, 1b, 2-22 incl. 16b/16c/20b (skip section 0
--                           — the schema already exists after the first run)
--    Set destination table: UNCHECKED (the script writes its own tables)
--    Credentials:           your gcloud user creds (dashboard SA is read-only)
-- 4. Save. The script will run every morning, refreshing all 26 tables
--    (incl. _fact_trips and the mv_fact_grain client-aggregation base).
--
-- SANITY CHECKS after first run
-- -----------------------------
-- SELECT * FROM `drivn-project-1.dashboard_kpis.mv_network_kpis`;
--   -> 1 row with total_trips, coverage_pct, total_revenue, etc.
-- SELECT COUNT(*) FROM `drivn-project-1.dashboard_kpis.mv_route_summary`;
--   -> number of distinct routes in catalog
-- SELECT * FROM `drivn-project-1.dashboard_kpis.mv_dashboard_meta`;
--   -> refreshed_at = now-ish, scheduled_trips + captured_trips populated
