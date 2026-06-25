import { api } from '@/store/ipcClient'

export interface ColumnMeta {
  name: string
  dataType: string
  isPrimaryKey: boolean
}

interface SchemaContext {
  connectionId: string | null
  database: string | null
  /** Lowercased table name → columns (preloaded from the connection tree). */
  tableColumns: Map<string, ColumnMeta[]>
  /** Lowercased table names known to this connection. */
  tableNames: string[]
}

let ctx: SchemaContext = {
  connectionId: null,
  database: null,
  tableColumns: new Map(),
  tableNames: [],
}

/** The focused QueryEditor sets this to its connection's schema. */
export function setSchemaContext(next: SchemaContext): void {
  ctx = next
}

export function getSchemaContext(): SchemaContext {
  return ctx
}

/** Columns for a table — from cache, or fetched on demand and cached. */
export async function columnsFor(table: string): Promise<ColumnMeta[]> {
  const key = table.toLowerCase()
  const cached = ctx.tableColumns.get(key)
  if (cached) return cached
  if (!ctx.connectionId || !ctx.database) return []
  const r = await api().schema.listColumns(ctx.connectionId, ctx.database, table)
  if (!r.success) return []
  const cols = r.data.map((c) => ({
    name: c.name,
    dataType: c.dataType,
    isPrimaryKey: c.isPrimaryKey,
  }))
  ctx.tableColumns.set(key, cols)
  return cols
}
