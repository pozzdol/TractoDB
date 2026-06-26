// Lightweight FROM/JOIN alias extraction — regex, not a real SQL parser.

const SQL_KEYWORDS = new Set([
  'on', 'where', 'join', 'inner', 'left', 'right', 'outer', 'full', 'cross',
  'group', 'order', 'limit', 'offset', 'having', 'using', 'set', 'as', 'and',
  'or', 'union', 'select',
])

// FROM/JOIN <table[.schema]> [AS] <alias>
const ALIAS_RE =
  /\b(?:from|join)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s+(?:as\s+)?([A-Za-z_]\w*)/gi

/** Map of lowercased alias → lowercased base table name for the current query. */
export function parseAliases(sql: string): Map<string, string> {
  const map = new Map<string, string>()
  let m: RegExpExecArray | null
  ALIAS_RE.lastIndex = 0
  while ((m = ALIAS_RE.exec(sql)) !== null) {
    const rawTable = m[1] ?? ''
    const alias = (m[2] ?? '').toLowerCase()
    if (!alias || SQL_KEYWORDS.has(alias)) continue
    const table = rawTable.includes('.') ? (rawTable.split('.').pop() ?? rawTable) : rawTable
    map.set(alias, table.toLowerCase())
  }
  return map
}

/**
 * Generate an alias from a table name (pure):
 *   ≤3 chars     → use as-is                  (log → log)
 *   snake_case   → initials of each word      (model_has_roles → mhr)
 *   single word  → first letter               (users → u, orders → o)
 * Pass `used` to get a conflict-free alias by appending a number (u → u2 → u3).
 */
export function generateAlias(tableName: string, used: Set<string> = new Set()): string {
  const clean = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '')
  let base: string
  if (clean.length <= 3) base = clean
  else if (clean.includes('_')) base = clean.split('_').filter(Boolean).map((p) => p[0] ?? '').join('')
  else base = clean[0] ?? 't'
  if (!base) base = 't'
  let alias = base
  let n = 2
  while (used.has(alias)) alias = `${base}${n++}`
  return alias
}
