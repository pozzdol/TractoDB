import { IDLE_EXECUTION, useQueryStore, type QueryExecution } from '@/store/queryStore'

interface UseQueryResult {
  execution: QueryExecution
  run: (connectionId: string, sql: string, database?: string | null) => Promise<void>
  cancel: (connectionId: string) => Promise<void>
}

/** Per-tab query execution: loading/result/error state plus run/cancel. */
export function useQuery(tabId: string): UseQueryResult {
  const execution = useQueryStore((s) => s.byTab[tabId] ?? IDLE_EXECUTION)
  const runAction = useQueryStore((s) => s.run)
  const cancelAction = useQueryStore((s) => s.cancel)

  return {
    execution,
    run: (connectionId, sql, database) => runAction(tabId, connectionId, sql, database),
    cancel: (connectionId) => cancelAction(tabId, connectionId),
  }
}
