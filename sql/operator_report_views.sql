-- =============================================================================
-- operator_report_views.sql — Operator Report Generator
--
-- OPTIONAL. The report proxy (server/report.js) already inlines this logic, so
-- the app works WITHOUT running this file. Create the view if you'd rather the
-- classification + sub-brand merge live centrally in BigQuery.
--
-- Reads ONLY drivn-project-1.dashboard_kpis._fact_trips (the deduped trip-level
-- MV). It NEVER touches the raw source tables
-- (drivn-project-1.dunamic_window_scrapper_redbus.*).
--
-- A VIEW = zero storage, always reflects the latest _fact_trips, and is
-- independent of the daily scheduled query (dashboard_kpis_bq.sql). Run once:
--   bq query --use_legacy_sql=false < sql/operator_report_views.sql
-- (requires write access to the dataset; the read-only report SA does not need it).
-- =============================================================================

-- =============================================================================
-- v_catalog_trips — the SCHEDULED-departures spine (trip COUNTS source).
--
-- The report's "number of trips" comes from the catalog (what was scheduled),
-- NOT from the api scrape (what was captured) — the two differ because not every
-- scheduled departure is captured. The catalog source
-- (dunamic_window_scrapper_redbus.redbus_today_catalog) has NULL bus_id and is
-- scraped repeatedly, so we de-dup to one row per
-- (route, operator, bus_type, travel_date, departure_time) = one scheduled trip.
-- This view is in the MV layer so both the dashboard and the report read it
-- (never the source table directly). It carries NO is_ev (the catalog payload's
-- is_ev is NULL), so EV/ICE splits still come from _fact_trips.
--   Run once:  bq query --use_legacy_sql=false < sql/operator_report_views.sql
-- =============================================================================
CREATE OR REPLACE VIEW `drivn-project-1.dashboard_kpis.v_catalog_trips` AS
WITH d AS (
  SELECT
    CONCAT(route_source, ' -> ', route_destination) AS route,
    route_source AS src, route_destination AS dst,
    CASE WHEN LOWER(operator_name) LIKE 'zingbus%'  THEN 'Zingbus'
         WHEN LOWER(operator_name) LIKE 'freshbus%' THEN 'FRESHBUS'
         ELSE operator_name END AS canon_operator,
    operator_name, bus_type,
    CASE WHEN LOWER(bus_type) LIKE '%seater%' AND LOWER(bus_type) LIKE '%sleeper%' THEN 'hybrid'
         WHEN LOWER(bus_type) LIKE '%seater%'  THEN 'seater'
         WHEN LOWER(bus_type) LIKE '%sleeper%' THEN 'sleeper' ELSE 'unknown' END AS bus_class,
    SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\d{1,2}):') AS INT64) AS dep_hour,
    travel_date, departure_time,
    ROW_NUMBER() OVER (
      PARTITION BY route_source, route_destination, operator_name, bus_type, travel_date, departure_time
      ORDER BY scraped_at DESC
    ) AS _rn
  FROM `drivn-project-1.dunamic_window_scrapper_redbus.redbus_today_catalog`
  WHERE travel_date >= DATE '2026-06-10' AND travel_date < CURRENT_DATE('Asia/Kolkata')
)
SELECT route, src, dst, canon_operator, operator_name, bus_type, bus_class, dep_hour, travel_date, departure_time
FROM d WHERE _rn = 1;


CREATE OR REPLACE VIEW `drivn-project-1.dashboard_kpis.v_report_trips` AS
SELECT
  travel_date,
  CONCAT(route_source, ' -> ', route_destination)                          AS route,
  route_source AS src,
  route_destination AS dst,
  operator_name,
  CASE                                              -- canonical sub-brand merge
    WHEN LOWER(operator_name) LIKE 'zingbus%'  THEN 'Zingbus'
    WHEN LOWER(operator_name) LIKE 'freshbus%' THEN 'FRESHBUS'
    ELSE operator_name
  END                                                                      AS canon_operator,
  bus_type,
  CASE                                              -- seater-only / sleeper-only / both = hybrid
    WHEN LOWER(bus_type) LIKE '%seater%' AND LOWER(bus_type) LIKE '%sleeper%' THEN 'hybrid'
    WHEN LOWER(bus_type) LIKE '%seater%'  THEN 'seater'
    WHEN LOWER(bus_type) LIKE '%sleeper%' THEN 'sleeper'
    ELSE 'unknown'
  END                                                                      AS bus_class,
  SAFE_CAST(REGEXP_EXTRACT(CAST(departure_time AS STRING), r'(\d{1,2}):') AS INT64) AS dep_hour,
  distance_km,
  occupancy_pct,
  price_inr,
  avg_seater_price,
  avg_sleeper_price,
  booked_seater_revenue,
  booked_sleeper_revenue,
  booked_revenue_inr,
  seater_booked,
  sleeper_booked,
  bus_id,
  unique_bus_id
FROM `drivn-project-1.dashboard_kpis._fact_trips`;
