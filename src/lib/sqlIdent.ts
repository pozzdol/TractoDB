import type { DatabaseType } from '@/types/connection'

/** Quote an identifier for the dialect (mirrors electron/ipc/sqlUtil for the renderer). */
export function quoteIdent(type: DatabaseType, name: string): string {
  if (type === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

/** Build a qualified table reference. SQLite ignores schema. */
export function qualifiedName(
  type: DatabaseType,
  schema: string | undefined,
  table: string,
): string {
  if (type !== 'sqlite' && schema) return `${quoteIdent(type, schema)}.${quoteIdent(type, table)}`
  return quoteIdent(type, table)
}
