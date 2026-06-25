// Lightweight FROM/JOIN alias extraction — regex, not a real SQL parser.

const SQL_KEYWORDS = new Set([
  'on', 'where', 'join', 'inner', 'left', 'right', 'outer', 'full', 'cross',
  'group', 'order', 'limit', 'offset', 'having', 'using', 'set', 'as', 'and',
  'or', 'union', 'select',
])

// FROM/JOIN <table[.schema]> [AS] <alias>
const ALIAS_RE =
  /\b(?:from|join)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s+(?:as\s+)?([A-Za-z_]\w*)/gi

/** Map of lowercased alias → lowercased base table name. */
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

/** Generate an alias: first letter, or snake_case initials; number on conflict. */
export function generateAlias(table: string, used: Set<string>): string {
  const clean = table.toLowerCase()
  const base = clean.includes('_')
    ? clean
        .split('_')
        .map((p) => p[0] ?? '')
        .join('')
    : (clean[0] ?? 't')
  let alias = base
  let n = 2
  while (used.has(alias)) alias = `${base}${n++}`
  return alias
}
