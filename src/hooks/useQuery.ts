import { IDLE_EXECUTION, useQueryStore, type QueryExecution } from '@/store/queryStore'

interface UseQueryResult {
  execution: QueryExecution
  run: (connectionId: string, sql: string, database?: string | null) => Promise<void>
  loadMore: () => Promise<void>
  cancel: (connectionId: string) => Promise<void>
}

/** Per-tab query execution: loading/result/error state plus run/loadMore/cancel. */
export function useQuery(tabId: string): UseQueryResult {
  const execution = useQueryStore((s) => s.byTab[tabId] ?? IDLE_EXECUTION)
  const runAction = useQueryStore((s) => s.run)
  const loadMoreAction = useQueryStore((s) => s.loadMore)
  const cancelAction = useQueryStore((s) => s.cancel)

  return {
    execution,
    run: (connectionId, sql, database) => runAction(tabId, connectionId, sql, database),
    loadMore: () => loadMoreAction(tabId),
    cancel: (connectionId) => cancelAction(tabId, connectionId),
  }
}
