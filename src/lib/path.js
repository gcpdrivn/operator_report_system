// Resolve a dotted path against an object, e.g. getByPath(payload, 'revenue.split').
export function getByPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
