import { create } from 'zustand'
import type { QueryHistoryEntry, QueryResult } from '@shared/ipc'
import { api, unwrap } from './ipcClient'

const HISTORY_LIMIT = 100

function prepend(history: QueryHistoryEntry[], entry: QueryHistoryEntry): QueryHistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_LIMIT)
}

export type QueryStatus = 'idle' | 'running' | 'success' | 'error'

export interface QueryExecution {
  status: QueryStatus
  result?: QueryResult
  error?: string
}

const IDLE: QueryExecution = { status: 'idle' }

export interface QueryStore {
  /** Execution state keyed by tab id — survives tab switches. */
  byTab: Record<string, QueryExecution>
  /** Session query history, newest first. */
  history: QueryHistoryEntry[]
  run: (tabId: string, connectionId: string, sql: string, database?: string | null) => Promise<void>
  cancel: (tabId: string, connectionId: string) => Promise<void>
  clear: (tabId: string) => void
}

export const useQueryStore = create<QueryStore>((set) => ({
  byTab: {},
  history: [],

  async run(tabId, connectionId, sql, database) {
    set((s) => ({ byTab: { ...s.byTab, [tabId]: { status: 'running' } } }))
    const executedAt = new Date().toISOString()
    try {
      const result = unwrap(await api().query.execute(connectionId, sql, database ?? undefined))
      set((s) => ({
        byTab: { ...s.byTab, [tabId]: { status: 'success', result } },
        history: prepend(s.history, {
          id: crypto.randomUUID(),
          connectionId,
          sql,
          executedAt,
          durationMs: result.durationMs,
          rowCount: result.rowCount,
        }),
      }))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      set((s) => ({
        byTab: { ...s.byTab, [tabId]: { status: 'error', error } },
        history: prepend(s.history, {
          id: crypto.randomUUID(),
          connectionId,
          sql,
          executedAt,
          durationMs: 0,
          rowCount: 0,
          error,
        }),
      }))
    }
  },

  async cancel(_tabId, connectionId) {
    try {
      await api().query.cancel(connectionId)
    } catch {
      /* best effort */
    }
  },

  clear(tabId) {
    set((s) => {
      const rest = { ...s.byTab }
      delete rest[tabId]
      return { byTab: rest }
    })
  },
}))

export { IDLE as IDLE_EXECUTION }
