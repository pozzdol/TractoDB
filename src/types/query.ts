// Query types for the renderer. Wire types come from shared/ipc.ts.

export type {
  QueryColumn,
  QueryHistoryEntry,
  QueryRequest,
  QueryResult,
} from '@shared/ipc'

import type { QueryResult } from '@shared/ipc'

interface QueryError {
  message: string
  code?: string
}

export type QueryStatus = 'idle' | 'running' | 'success' | 'error'

/** The execution state of one query editor tab (held by useQuery / tab state). */
export interface QueryExecution {
  status: QueryStatus
  result?: QueryResult
  error?: QueryError
}
