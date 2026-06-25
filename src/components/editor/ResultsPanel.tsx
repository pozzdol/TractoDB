import { useState } from 'react'
import { useQueryStore, type QueryExecution } from '@/store/queryStore'
import { DataGrid } from '@/components/grid/DataGrid'
import styles from './ResultsPanel.module.css'

type SubTab = 'result' | 'messages' | 'history'

interface ResultsPanelProps {
  execution?: QueryExecution
  onLoadMore?: () => void
}

function rowCounter(e: QueryExecution): string {
  if (e.totalCount === undefined) return `${e.rows.length} rows`
  return e.hasMore
    ? `Showing ${e.rows.length} of ${e.totalCount.toLocaleString()} rows`
    : `All ${e.totalCount.toLocaleString()} rows`
}

export function ResultsPanel({ execution, onLoadMore }: ResultsPanelProps) {
  const [tab, setTab] = useState<SubTab>('result')
  const history = useQueryStore((s) => s.history)
  const hasRun = execution && execution.status !== 'idle'

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'result', label: 'Result' },
    { id: 'messages', label: 'Messages' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.meta}>
          {execution && execution.status === 'success' ? (
            <>
              <span className={styles.count}>{rowCounter(execution)}</span>
              <span className={styles.timing}>{execution.durationMs} ms</span>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.body}>
        {tab === 'result' &&
          (execution?.status === 'running' ? (
            <p className={styles.message}>Running…</p>
          ) : execution?.status === 'error' ? (
            <p className={styles.error}>{execution.error}</p>
          ) : hasRun ? (
            <DataGrid
              columns={execution!.columns}
              rows={execution!.rows}
              hasMore={execution!.hasMore}
              isLoadingMore={execution!.isLoadingMore}
              onLoadMore={onLoadMore}
            />
          ) : (
            <p className={styles.message}>Run a query to see results.</p>
          ))}

        {tab === 'messages' && (
          <div className={styles.messages}>
            {execution?.status === 'error' ? (
              <p className={styles.error}>{execution.error}</p>
            ) : execution?.status === 'success' ? (
              <>
                <p className={styles.message}>
                  {execution.columns.length > 0
                    ? `${rowCounter(execution)} in ${execution.durationMs} ms.`
                    : `Statement executed in ${execution.durationMs} ms.`}
                </p>
                {execution.notice ? <p className={styles.notice}>{execution.notice}</p> : null}
              </>
            ) : (
              <p className={styles.message}>No messages.</p>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className={styles.history}>
            {history.length === 0 ? (
              <p className={styles.message}>No queries run yet.</p>
            ) : (
              history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={styles.historyItem}
                  title="Copy SQL"
                  onClick={() => void navigator.clipboard.writeText(h.sql)}
                >
                  <span className={styles.historyTime}>
                    {new Date(h.executedAt).toLocaleTimeString()}
                  </span>
                  <span className={styles.historySql}>{h.sql}</span>
                  <span className={h.error ? styles.historyErr : styles.historyStat}>
                    {h.error ? 'error' : `${h.rowCount} rows · ${h.durationMs} ms`}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
