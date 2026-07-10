// Route-level report schema. Same structure/conventions as the operator schema
// (reportSchema.js) — sections → tables → columns, driven into the toggle tree,
// preview, and exports. Mirrors the dashboard's Route Insights + EV vs ICE tabs.
// All figures aggregate ALL operators on the route (the market view).

export const ROUTE_SCHEMA = [
  {
    id: 'routeExec', title: '1. Executive Summary', operatorScoped: true,
    scope: 'WHOLE ROUTE MARKET — all operators on this corridor combined.',
    tables: [
      {
        id: 'kpi', title: 'Key Performance Indicators', kind: 'kpi', field: 'exec.kpis',
        columns: [
          { key: 'avgOccPct', label: 'Avg Occupancy / Day', format: 'pct1' },
          { key: 'avgRevDay', label: 'Avg Revenue / Day', format: 'lakhShort' },
          { key: 'overallAsp', label: 'Overall ASP', format: 'rupee' },
        ],
      },
    ],
  },
  {
    id: 'routeProfile', title: '2. Route Profile', operatorScoped: true,
    scope: 'All operators on this route. Operators / Trips = SCHEDULED (catalog); Unique Buses & EV% = CAPTURED (scrape).',
    tables: [
      {
        id: 'metrics', title: 'Route Metrics', kind: 'kpi', field: 'profile.metrics',
        columns: [
          { key: 'distanceKm', label: 'Distance (km)', format: 'int' },
          { key: 'operators', label: 'Operators', format: 'int' },
          { key: 'uniqueBuses', label: 'Unique Buses', format: 'int' },
          { key: 'tripsPerDay', label: 'Trips / Day', format: 'int' },
          { key: 'avgTripDuration', label: 'Avg Trip Duration', format: 'hrs2' },
          { key: 'evPenetration', label: 'EV Penetration', format: 'pct1' },
          { key: 'projMonthly', label: 'Projected Monthly Rev', format: 'lakhShort' },
        ],
      },
    ],
  },
  {
    id: 'routeRevenue', title: '3. Revenue Dashboard', operatorScoped: true,
    scope: 'All operators on this route (market). Revenue / occupancy / ASP from CAPTURED trips.',
    tables: [
      {
        id: 'metrics', title: 'Revenue Metrics at a Glance', kind: 'kpi', field: 'revenue.metrics',
        columns: [
          { key: 'avgRevDay', label: 'Avg Revenue / Day', format: 'lakhShort' },
          { key: 'overallAsp', label: 'Overall ASP', format: 'rupee' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee' },
        ],
      },
      {
        id: 'unitEconomics', title: 'Unit Economics', kind: 'kpi', field: 'revenue.unitEconomics',
        columns: [
          { key: 'revPerTrip', label: 'Avg Revenue / Trip', format: 'rupee' },
          { key: 'revPerKm', label: 'Avg Revenue / Km', format: 'rupee' },
          { key: 'revPerSeatKm', label: 'Avg Rev / Seat / Km', format: 'rupee2' },
          { key: 'revPerSeaterKm', label: 'Avg Rev / Seater / Km', format: 'rupee2' },
          { key: 'revPerSleeperKm', label: 'Avg Rev / Sleeper / Km', format: 'rupee2' },
        ],
      },
      {
        id: 'split', title: 'Seater vs Sleeper Revenue Split', kind: 'grid', field: 'revenue.split',
        columns: [
          { key: 'segment', label: 'Segment', format: 'text', align: 'left', bold: true },
          { key: 'share', label: 'Share', format: 'share1', align: 'right' },
          { key: 'revDay', label: 'Revenue / Day (₹ Lakhs)', format: 'rupeeLakh2', align: 'right' },
          { key: 'period', label: 'Period (₹L)', format: 'rupeeLakh2', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'routeOccupancy', title: '4. Occupancy Analysis', operatorScoped: true,
    scope: 'All operators on this route (market). Occupancy from CAPTURED trips; Trips/Day are SCHEDULED.',
    tables: [
      {
        id: 'daily', title: 'Overall Occupancy Trend (daily)', kind: 'lineChart', field: 'occupancy.daily',
        xKey: 'date',
        series: [{ key: 'occupancy', label: 'Occupancy', format: 'pct1', color: 'var(--accent-strong)' }],
        // columns are used for the Excel export + the column-toggle tree (the chart plots `series`).
        columns: [
          { key: 'date', label: 'Date', format: 'date', align: 'left' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'revenue', label: 'Revenue (day)', format: 'lakh2', align: 'right' },
        ],
      },
      {
        id: 'timeOfDay', title: 'Occupancy by Time of Day', kind: 'grid', field: 'occupancy.timeOfDay',
        note: 'Scrape window ≈ 05:00–24:00 IST. Departures between midnight and 05:00 are captured only via prior-evening scrapes, so the Night / Early (00–08) slot under-represents the 00:00–05:00 hours.',
        columns: [
          { key: 'slot', label: 'Time Slot', format: 'text', align: 'left' },
          { key: 'avgOccupancy', label: 'Avg Occupancy', format: 'pct1', align: 'right' },
          { key: 'tripsDay', label: 'Trips/Day', format: 'tripsDay', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'operatorLandscape', title: '5. Operator Landscape',
    scope: 'BROKEN DOWN BY OPERATOR — the top 15 operators on this route by revenue (one row per operator).',
    note: 'All operators on this route, ranked by revenue (top 15). Market Share = operator revenue ÷ total route revenue. Trips/Day = scheduled departures.',
    tables: [
      {
        id: 'operators', title: 'Operators on this Route', kind: 'grid', field: 'operatorLandscape.operators',
        columns: [
          { key: 'rank', label: 'Rank', format: 'int', align: 'right' },
          { key: 'operator', label: 'Operator', format: 'text', align: 'left', bold: true },
          { key: 'tripsDay', label: 'Trips/Day', format: 'tripsDay', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee', align: 'right' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee', align: 'right' },
          { key: 'revDay', label: 'Revenue / Day', format: 'lakhShort', align: 'right' },
          { key: 'share', label: 'Market Share', format: 'share1', align: 'right' },
          { key: 'revPerKm', label: 'Rev / Km', format: 'rupee', align: 'right' },
          { key: 'revPerSeatKm', label: 'Rev / Seat / Km', format: 'rupee2', align: 'right' },
          { key: 'revPerSeaterKm', label: 'Rev / Seater / Km', format: 'rupee2', align: 'right' },
          { key: 'revPerSleeperKm', label: 'Rev / Sleeper / Km', format: 'rupee2', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'evIce', title: '6. EV vs ICE', operatorScoped: true,
    scope: 'All operators on this route, split by fuel (EV vs ICE). Counts are CAPTURED here (catalog has no fuel flag).',
    note: 'Electric vs internal-combustion fleets on this route. Trips/Day here is from captured (API) data — the catalog schedule carries no fuel flag, so the EV/ICE split can only come from the scrape.',
    tables: [
      {
        id: 'comparison', title: 'EV vs ICE — Unit Economics', kind: 'grid', field: 'evIce.comparison',
        columns: [
          { key: 'fuel', label: 'Fuel', format: 'text', align: 'left', bold: true },
          { key: 'tripsDay', label: 'Trips/Day', format: 'tripsDay', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee', align: 'right' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee', align: 'right' },
          { key: 'revPerTrip', label: 'Revenue / Trip', format: 'rupee', align: 'right' },
          { key: 'revPerKm', label: 'Revenue / Km', format: 'rupee', align: 'right' },
          { key: 'revPerSeaterKm', label: 'Rev / Seater / Km', format: 'rupee2', align: 'right', defaultOff: true },
          { key: 'revPerSleeperKm', label: 'Rev / Sleeper / Km', format: 'rupee2', align: 'right', defaultOff: true },
        ],
      },
      {
        id: 'daily', title: 'Daily Revenue & Occupancy — EV vs ICE', kind: 'grid', field: 'evIce.daily',
        columns: [
          { key: 'date', label: 'Date', format: 'date', align: 'left' },
          { key: 'evRev', label: 'EV Revenue', format: 'lakh2', align: 'right' },
          { key: 'iceRev', label: 'ICE Revenue', format: 'lakh2', align: 'right' },
          { key: 'evOcc', label: 'EV Occ', format: 'pct1', align: 'right' },
          { key: 'iceOcc', label: 'ICE Occ', format: 'pct1', align: 'right' },
        ],
      },
      {
        id: 'fleet', title: 'Fleet Composition by Fuel', kind: 'grid', field: 'evIce.fleet',
        columns: [
          { key: 'busType', label: 'Bus Type', format: 'text', align: 'left' },
          { key: 'evCnt', label: 'EV Buses', format: 'dash', align: 'right' },
          { key: 'iceCnt', label: 'ICE Buses', format: 'dash', align: 'right' },
        ],
      },
    ],
  },
]
