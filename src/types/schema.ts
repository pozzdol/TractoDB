// Schema types for the renderer. Wire types come from shared/ipc.ts; the
// *Node types add the lazy-load / expansion bookkeeping the sidebar tree needs.

export type {
  ColumnInfo,
  ColumnKey,
  DatabaseInfo,
  TableInfo,
  TableType,
} from '@shared/ipc'

import type { ColumnInfo, DatabaseInfo, TableInfo } from '@shared/ipc'

export interface TableNode extends TableInfo {
  expanded: boolean
  loadingColumns: boolean
  columns?: ColumnInfo[]
}

export interface DatabaseNode extends DatabaseInfo {
  expanded: boolean
  loadingTables: boolean
  tables?: TableNode[]
}
