// Single source of truth for the report. The customization toggle tree AND the
// live preview AND the XLSX export all iterate this structure. `field` is the
// dotted path into the /api/report payload. `format` tokens are resolved by
// src/lib/format.js. Table `kind`: 'kpi' (one metric object -> Stat tiles),
// 'grid' (row array -> table), or 'grid' + dynamicByRoute (one table per route).

export const REPORT_SCHEMA = [
  {
    id: 'exec', title: '1. Executive Summary',
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
    id: 'fleet', title: '2. Fleet Profile',
    tables: [
      {
        id: 'composition', title: 'Fleet Composition Breakdown', kind: 'grid', field: 'fleet.composition',
        note: 'Buses/Day = average buses per day (period trips ÷ travel dates), rounded to whole numbers.',
        columns: [
          { key: 'type', label: 'Type', format: 'text', align: 'left', bold: true },
          { key: 'busesDay', label: 'Buses/Day', format: 'int', align: 'right' },
          { key: 'routes', label: 'Routes', format: 'int', align: 'right' },
          { key: 'description', label: 'Description', format: 'text', align: 'left' },
        ],
      },
      {
        id: 'matrix', title: 'Route × Departure Matrix', kind: 'grid', field: 'fleet.matrix',
        note: 'Per-day figures rounded to whole buses, so rows/columns may differ ±1 from rounding. Total Trips = exact period count.',
        columns: [
          { key: 'route', label: 'Route', format: 'text', align: 'left' },
          { key: 'od', label: 'Origin → Destination', format: 'text', align: 'left' },
          { key: 'seater', label: 'Seater', format: 'dash', align: 'right' },
          { key: 'sleeper', label: 'Sleeper', format: 'dash', align: 'right' },
          { key: 'hybrid', label: 'Hybrid', format: 'dash', align: 'right' },
          { key: 'busesDay', label: 'Buses/Day', format: 'int', align: 'right' },
          { key: 'totalTrips', label: 'Total Trips', format: 'int', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'revenue', title: '3. Revenue Dashboard',
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
        id: 'distribution', title: 'Route × Revenue Distribution', kind: 'grid', field: 'revenue.distribution',
        columns: [
          { key: 'route', label: 'Route', format: 'text', align: 'left' },
          { key: 'revDay', label: 'Revenue / Day (₹ Lakhs)', format: 'rupeeLakh2', align: 'right' },
          { key: 'share', label: 'Share', format: 'share1', align: 'right' },
          { key: 'period', label: 'Period (₹L)', format: 'rupeeLakh2', align: 'right' },
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
      {
        id: 'bestRoutes', title: 'Best Routes by Revenue per Trip', kind: 'grid', field: 'revenue.bestRoutes',
        note: 'Revenue / Trip = period revenue ÷ trips. Distance = one-way km. Revenue / Km = Rev/Trip ÷ distance. Per-seat/seater/sleeper-km = revenue ÷ Σ(distance × seats).',
        columns: [
          { key: 'rank', label: 'Rank', format: 'int', align: 'right' },
          { key: 'route', label: 'Route', format: 'text', align: 'left', bold: true },
          { key: 'distanceKm', label: 'Distance (km)', format: 'dash', align: 'right' },
          { key: 'revPerTrip', label: 'Avg Revenue / Trip', format: 'rupee', align: 'right' },
          { key: 'occPct', label: 'Avg Occupancy %', format: 'pct1', align: 'right' },
          { key: 'revPerKm', label: 'Avg Revenue / Km', format: 'rupee', align: 'right' },
          { key: 'revPerSeatKm', label: 'Avg Rev / Seat / Km', format: 'rupee2', align: 'right', defaultOff: true },
          { key: 'revPerSeaterKm', label: 'Avg Rev / Seater / Km', format: 'rupee2', align: 'right', defaultOff: true },
          { key: 'revPerSleeperKm', label: 'Avg Rev / Sleeper / Km', format: 'rupee2', align: 'right', defaultOff: true },
          { key: 'avgSeaterPrice', label: 'Avg Seater Price', format: 'rupee', align: 'right', defaultOff: true },
          { key: 'avgSleeperPrice', label: 'Avg Sleeper Price', format: 'rupee', align: 'right', defaultOff: true },
        ],
      },
    ],
  },
  {
    id: 'occupancy', title: '4. Occupancy Analysis',
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
    id: 'competitive', title: '5. Competitive Benchmarking',
    note: 'Operator vs Market — Market = all OTHER operators on the same routes the operator runs.',
    tables: [
      {
        id: 'overall', title: 'Overall Position', kind: 'grid', field: 'competitive.overall',
        columns: [
          { key: 'metric', label: 'Metric', format: 'text', align: 'left', bold: true },
          { key: 'operator', label: '{operator}', format: 'auto', align: 'right' },
          { key: 'market', label: 'Market avg (same routes)', format: 'auto', align: 'right' },
        ],
      },
      {
        id: 'byRoute', title: 'By Route — {operator} vs Market', kind: 'grid', field: 'competitive.byRoute',
        note: 'Mkt / Market = all other operators on that route.',
        columns: [
          { key: 'route', label: 'Route', format: 'text', align: 'left' },
          { key: 'opOcc', label: '{operator} Occ', format: 'pct1', align: 'right' },
          { key: 'mktOcc', label: 'Mkt Occ', format: 'pct1', align: 'right' },
          { key: 'opAsp', label: '{operator} ASP', format: 'rupee', align: 'right' },
          { key: 'mktAsp', label: 'Mkt ASP', format: 'rupee', align: 'right' },
          { key: 'mktP50', label: 'Mkt P50', format: 'pct1', align: 'right', defaultOff: true },
          { key: 'mktP75', label: 'Mkt P75', format: 'pct1', align: 'right', defaultOff: true },
          { key: 'mktP90', label: 'Mkt P90', format: 'pct1', align: 'right', defaultOff: true },
        ],
      },
      {
        id: 'percentiles', title: 'Occupancy Percentiles (vs Market)', kind: 'grid', field: 'competitive.percentiles',
        defaultOff: true,   // not in the canonical FRESHBUS report; available as an optional table
        columns: [
          { key: 'who', label: 'Segment', format: 'text', align: 'left', bold: true },
          { key: 'mean', label: 'Mean', format: 'pct1', align: 'right' },
          { key: 'p50', label: 'P50', format: 'pct1', align: 'right' },
          { key: 'p75', label: 'P75', format: 'pct1', align: 'right' },
          { key: 'p90', label: 'P90', format: 'pct1', align: 'right' },
        ],
      },
      {
        id: 'topOperators', title: '{operator} Performance — Selected Routes', kind: 'grid',
        field: 'competitive.topOperators', dynamicByRoute: true,
        columns: [
          { key: 'operator', label: 'Operator', format: 'text', align: 'left' },
          { key: 'tripsDay', label: 'Trips/Day', format: 'int', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', format: 'pct1', align: 'right' },
          { key: 'seaterAsp', label: 'Seater ASP', format: 'rupee', align: 'right' },
          { key: 'sleeperAsp', label: 'Sleeper ASP', format: 'rupee', align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'crossOperator', title: '6. Cross-Operator Comparison',
    note: 'Across {operator}’s routes (sorted by {operator} frequency). Pick comparison operators in the controls. “Not Running” = that operator has no service on the route. Columns below toggle which metrics show for every operator.',
    tables: [
      {
        id: 'comparison', title: '{operator} vs Selected Operators', kind: 'crossOperator', field: 'crossOperator',
        // These toggle which metric groups appear (for the subject + each comparison operator).
        columns: [
          { key: 'occ', label: 'Show Occupancy', format: 'text' },
          { key: 'asp', label: 'Show ASP', format: 'text' },
          { key: 'rtrip', label: 'Show Revenue / Trip', format: 'text' },
        ],
      },
    ],
  },
  {
    id: 'suggested', title: '7. Suggested Routes',
    note: 'Top 10 market corridors (all operators) by the chosen criteria. Set the ranking criteria and the presence filter in the controls.',
    tables: [
      {
        id: 'topRoutes', title: 'Top 10 Corridors', kind: 'suggested', field: 'suggested',
        columns: [
          { key: 'rank', label: 'Rank', format: 'int', align: 'right' },
          { key: 'route', label: 'Route', format: 'text', align: 'left', bold: true },
          { key: 'distanceKm', label: 'Distance (km)', format: 'dash', align: 'right' },
          { key: 'mktRevDay', label: 'Mkt Rev / Day (₹L)', format: 'rupeeLakh2', align: 'right' },
          { key: 'mktOcc', label: 'Mkt Occ', format: 'pct1', align: 'right' },
          { key: 'tripsDay', label: 'Trips/Day', format: 'int', align: 'right' },
          { key: 'evPct', label: 'EV Now %', format: 'pct1', align: 'right' },
          { key: 'operators', label: 'Operators', format: 'int', align: 'right', defaultOff: true },
          { key: 'subjectFlag', label: '{operator}?', format: 'text', align: 'center' },
          { key: 'compFlags', label: 'Comparison-operator presence', format: 'text', align: 'center' },
        ],
      },
    ],
  },
]

// Helpers shared by the controls tree, preview, and export.
export const tableKey = (sectionId, tableId) => `${sectionId}.${tableId}`

export function eachTable(fn) {
  for (const section of REPORT_SCHEMA) {
    for (const table of section.tables) fn(section, table)
  }
}
