import { REPORT_SCHEMA } from './reportSchema.js'
import { ROUTE_SCHEMA } from './routeReportSchema.js'

// Report-type registry. config.reportType ('operator' | 'route') selects which
// schema drives the toggle tree, preview, and exports.
export const SCHEMAS = { operator: REPORT_SCHEMA, route: ROUTE_SCHEMA }
export const schemaFor = (type) => SCHEMAS[type] || REPORT_SCHEMA
