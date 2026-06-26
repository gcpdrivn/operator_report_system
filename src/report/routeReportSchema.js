// Route-level report schema. Same structure/conventions as the operator schema
// (reportSchema.js) — sections → tables → columns, driven into the toggle tree,
// preview, and exports. Mirrors the dashboard's Route Insights + EV vs ICE tabs.
// All figures aggregate ALL operators on the route (the market view).

export const ROUTE_SCHEMA = [
  {
    id: 'routeExec', title: '1. Executive Summary',
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
    id: 'routeProfile', title: '2. Route Profile',
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
    id: 'routeRevenue', title: '3. Revenue Dashboard',
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
    id: 'routeOccupancy', title: '4. Occupancy Analysis',
    tables: [
      {
        id: 'daily', title: 'Overall Occupancy Trend (daily)', kind: 'grid', field: 'occupancy.daily',
        columns: [
          { key: 'date', label: 'Date', format: 'date', align: 'left' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'revenue', label: 'Revenue (day)', format: 'lakh2', align: 'right' },
        ],
      },
      {
        id: 'timeOfDay', title: 'Occupancy by Time of Day', kind: 'grid', field: 'occupancy.timeOfDay',
        columns: [
          { key: 'slot', label: 'Time Slot', format: 'text', align: 'left' },
          { key: 'avgOccupancy', label: 'Avg Occupancy', format: 'pct1', align: 'right' },
          { key: 'tripsDay', label: 'Trips/Day', format: 'int', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'operatorLandscape', title: '5. Operator Landscape',
    note: 'All operators on this route, ranked by revenue (top 15). Market Share = operator revenue ÷ total route revenue.',
    tables: [
      {
        id: 'operators', title: 'Operators on this Route', kind: 'grid', field: 'operatorLandscape.operators',
        columns: [
          { key: 'rank', label: 'Rank', format: 'int', align: 'right' },
          { key: 'operator', label: 'Operator', format: 'text', align: 'left', bold: true },
          { key: 'tripsDay', label: 'Trips/Day', format: 'int', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee', align: 'right' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee', align: 'right' },
          { key: 'revDay', label: 'Revenue / Day', format: 'lakhShort', align: 'right' },
          { key: 'share', label: 'Market Share', format: 'share1', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'evIce', title: '6. EV vs ICE',
    note: 'Electric vs internal-combustion fleets on this route. Trips/Day here is from captured (API) data — the catalog schedule carries no fuel flag, so the EV/ICE split can only come from the scrape.',
    tables: [
      {
        id: 'comparison', title: 'EV vs ICE — Unit Economics', kind: 'grid', field: 'evIce.comparison',
        columns: [
          { key: 'fuel', label: 'Fuel', format: 'text', align: 'left', bold: true },
          { key: 'tripsDay', label: 'Trips/Day', format: 'int', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee', align: 'right' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee', align: 'right' },
          { key: 'revDay', label: 'Revenue / Day', format: 'lakhShort', align: 'right' },
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
