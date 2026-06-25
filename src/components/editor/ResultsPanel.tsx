import { useState } from 'react'
import { useQueryStore, type QueryExecution } from '@/store/queryStore'
import { DataGrid } from '@/components/grid/DataGrid'
import styles from './ResultsPanel.module.css'

type SubTab = 'result' | 'messages' | 'history'

interface ResultsPanelProps {
  execution?: QueryExecution
}

export function ResultsPanel({ execution }: ResultsPanelProps) {
  const [tab, setTab] = useState<SubTab>('result')
  const history = useQueryStore((s) => s.history)
  const result = execution?.result

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
          {result ? <span className={styles.count}>{result.rowCount} rows</span> : null}
          {result ? <span className={styles.timing}>{result.durationMs} ms</span> : null}
        </div>
      </div>

      <div className={styles.body}>
        {tab === 'result' &&
          (execution?.status === 'running' ? (
            <p className={styles.message}>Running…</p>
          ) : execution?.status === 'error' ? (
            <p className={styles.error}>{execution.error}</p>
          ) : result ? (
            <DataGrid result={result} />
          ) : (
            <p className={styles.message}>Run a query to see results.</p>
          ))}

        {tab === 'messages' && (
          <div className={styles.messages}>
            {execution?.status === 'error' ? (
              <p className={styles.error}>{execution.error}</p>
            ) : result ? (
              <>
                <p className={styles.message}>
                  {result.columns.length > 0
                    ? `${result.rowCount} row(s) returned in ${result.durationMs} ms.`
                    : `${result.rowCount} row(s) affected in ${result.durationMs} ms.`}
                </p>
                {result.notice ? <p className={styles.notice}>{result.notice}</p> : null}
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
