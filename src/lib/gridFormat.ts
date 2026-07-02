// Clipboard formatters for the data grid (BUG 8). Rows are objects keyed by the
// column's unique displayName; SQL identifiers use the raw column name.

export interface FmtColumn {
  name: string
  displayName: string
}

type Row = Record<string, unknown>

/** TSV/Markdown cell: NULL → empty, objects → JSON, trim trailing whitespace. */
export function tsvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v).replace(/\s+$/, '')
}

/** SQL literal: NULL/number/boolean raw; Date/object/string quoted + escaped. */
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v instanceof Date) return `'${v.toISOString()}'`
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

const valuesOf = (cols: FmtColumn[], row: Row): unknown[] => cols.map((c) => row[c.displayName])

/** TSV (Excel). `header` adds a displayName header line. */
export function toTSV(cols: FmtColumn[], rows: Row[], header: boolean): string {
  const lines: string[] = []
  if (header) lines.push(cols.map((c) => c.displayName).join('\t'))
  for (const row of rows) lines.push(valuesOf(cols, row).map(tsvCell).join('\t'))
  return lines.join('\n')
}

/** JSON: object (single) or array of objects, keyed by displayName. */
export function toJSON(cols: FmtColumn[], rows: Row[], array: boolean): string {
  const objs = rows.map((row) => Object.fromEntries(cols.map((c) => [c.displayName, row[c.displayName] ?? null])))
  return JSON.stringify(array ? objs : (objs[0] ?? {}), null, 2)
}

/** One INSERT per row. tableName is the already-qualified identifier. */
export function toSQL(cols: FmtColumn[], rows: Row[], tableName: string): string {
  const colList = cols.map((c) => `"${c.name}"`).join(', ')
  return rows
    .map((row) => `INSERT INTO ${tableName} (${colList}) VALUES (${valuesOf(cols, row).map(sqlValue).join(', ')});`)
    .join('\n')
}

/** Markdown table with header + separator rows. */
export function toMarkdown(cols: FmtColumn[], rows: Row[]): string {
  const header = `| ${cols.map((c) => c.displayName).join(' | ')} |`
  const sep = `| ${cols.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${valuesOf(cols, row).map((v) => tsvCell(v)).join(' | ')} |`)
  return [header, sep, ...body].join('\n')
}
