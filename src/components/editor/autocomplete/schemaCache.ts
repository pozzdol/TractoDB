import { api } from '@/store/ipcClient'

export interface ColumnMeta {
  name: string
  dataType: string
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface TableMeta {
  name: string
  isView: boolean
}

/**
 * Per-connection schema seen by the active query editor. Built from the
 * connection's loaded schema tree; columns not yet loaded are fetched on demand.
 * Scoped to one connection so columns are never mixed across connections.
 */
export interface EditorSchema {
  connectionId: string
  database: string | null
  tables: TableMeta[]
  /** Lowercased table name → columns already loaded in the schema tree. */
  preloaded: Map<string, ColumnMeta[]>
}

// On-demand column fetches, keyed by connectionId/database/table (lowercased).
const fetched = new Map<string, ColumnMeta[]>()

function cacheKey(s: EditorSchema, tableLower: string): string {
  return `${s.connectionId}/${s.database ?? ''}/${tableLower}`
}

/** Columns if already known (preloaded from the tree or previously fetched), else undefined. */
export function columnsCached(schema: EditorSchema, tableLower: string): ColumnMeta[] | undefined {
  return schema.preloaded.get(tableLower) ?? fetched.get(cacheKey(schema, tableLower))
}

/** Fetch a table's columns via IPC and cache them for this connection. */
export async function fetchColumns(schema: EditorSchema, tableLower: string): Promise<ColumnMeta[]> {
  const cached = columnsCached(schema, tableLower)
  if (cached) return cached
  const real = schema.tables.find((t) => t.name.toLowerCase() === tableLower)?.name ?? tableLower
  const r = await api().schema.listColumns(schema.connectionId, schema.database ?? '', real)
  const cols: ColumnMeta[] = r.success
    ? r.data.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isPrimaryKey: c.isPrimaryKey,
        isForeignKey: c.isForeignKey,
      }))
    : []
  fetched.set(cacheKey(schema, tableLower), cols)
  return cols
}
