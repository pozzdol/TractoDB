import type { DatabaseType } from '../../shared/ipc'

/** Quote an identifier for the dialect (backticks for MySQL, double-quotes else). */
export function quoteId(type: DatabaseType, name: string): string {
  if (type === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

/** Quote a value as a SQL literal. Numbers/bools inline; everything else escaped. */
export function quoteVal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Escape a value for use inside a single-quoted SQL string literal. */
export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

/** Build a qualified table reference for the dialect. SQLite ignores schema. */
export function qualify(
  type: DatabaseType,
  schema: string | undefined,
  table: string,
): string {
  if (type !== 'sqlite' && schema) {
    return `${quoteId(type, schema)}.${quoteId(type, table)}`
  }
  return quoteId(type, table)
}
