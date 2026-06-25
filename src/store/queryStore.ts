import { create } from 'zustand'
import type { QueryColumn, QueryHistoryEntry } from '@shared/ipc'
import { api, unwrap } from './ipcClient'

const PAGE = 100
const SOFT_WARN_ROWS = 10_000
const HISTORY_LIMIT = 100

type Row = Record<string, unknown>
export type QueryStatus = 'idle' | 'running' | 'success' | 'error'

export interface QueryExecution {
  status: QueryStatus
  columns: QueryColumn[]
  rows: Row[]
  totalCount?: number
  hasMore: boolean
  isLoadingMore: boolean
  durationMs?: number
  notice?: string
  error?: string
  // Retained so loadMore can fetch the next page.
  sql?: string
  connectionId?: string
  database?: string | null
}

const IDLE: QueryExecution = {
  status: 'idle',
  columns: [],
  rows: [],
  hasMore: false,
  isLoadingMore: false,
}

function prepend(history: QueryHistoryEntry[], entry: QueryHistoryEntry): QueryHistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_LIMIT)
}

export interface QueryStore {
  byTab: Record<string, QueryExecution>
  history: QueryHistoryEntry[]
  run: (tabId: string, connectionId: string, sql: string, database?: string | null) => Promise<void>
  loadMore: (tabId: string) => Promise<void>
  cancel: (tabId: string, connectionId: string) => Promise<void>
  clear: (tabId: string) => void
}

export const useQueryStore = create<QueryStore>((set, get) => ({
  byTab: {},
  history: [],

  async run(tabId, connectionId, sql, database) {
    set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...IDLE, status: 'running' } } }))
    const executedAt = new Date().toISOString()
    try {
      const result = unwrap(await api().query.execute(connectionId, sql, database ?? undefined, 0, PAGE))
      const notice =
        result.totalCount !== undefined && result.totalCount > SOFT_WARN_ROWS
          ? `This query returned ${result.totalCount.toLocaleString()} rows. Showing first ${PAGE} — scroll to load more.`
          : result.notice
      set((s) => ({
        byTab: {
          ...s.byTab,
          [tabId]: {
            status: 'success',
            columns: result.columns,
            rows: result.rows,
            totalCount: result.totalCount,
            hasMore: Boolean(result.hasMore),
            isLoadingMore: false,
            durationMs: result.durationMs,
            notice,
            sql,
            connectionId,
            database,
          },
        },
        history: prepend(s.history, {
          id: crypto.randomUUID(),
          connectionId,
          sql,
          executedAt,
          durationMs: result.durationMs,
          rowCount: result.totalCount ?? result.rowCount,
        }),
      }))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      set((s) => ({
        byTab: { ...s.byTab, [tabId]: { ...IDLE, status: 'error', error } },
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

  async loadMore(tabId) {
    const exec = get().byTab[tabId]
    if (!exec || !exec.hasMore || exec.isLoadingMore || !exec.connectionId || !exec.sql) return
    set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...exec, isLoadingMore: true } } }))
    try {
      const result = unwrap(
        await api().query.execute(exec.connectionId, exec.sql, exec.database ?? undefined, exec.rows.length, PAGE),
      )
      set((s) => {
        const current = s.byTab[tabId]
        if (!current) return s
        return {
          byTab: {
            ...s.byTab,
            [tabId]: {
              ...current,
              rows: [...current.rows, ...result.rows],
              hasMore: Boolean(result.hasMore),
              totalCount: result.totalCount ?? current.totalCount,
              isLoadingMore: false,
            },
          },
        }
      })
    } catch {
      set((s) => {
        const current = s.byTab[tabId]
        return current ? { byTab: { ...s.byTab, [tabId]: { ...current, isLoadingMore: false } } } : s
      })
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
