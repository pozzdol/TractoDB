import { Suspense, lazy } from 'react'
import { IconPlayerPlay, IconX } from '@tabler/icons-react'
import { useUiStore } from '@/store/uiStore'
import styles from './ColumnSqlBar.module.css'

export type Clause = 'WHERE' | 'ORDER BY' | 'LIMIT' | 'GROUP BY' | 'HAVING' | 'CUSTOM'
export const CLAUSES: Clause[] = ['WHERE', 'ORDER BY', 'LIMIT', 'GROUP BY', 'HAVING', 'CUSTOM']

/** Build the full query for a clause + content (table name injected here). */
export function buildClauseQuery(clause: Clause, qualified: string, content: string): string {
  const c = content.trim()
  if (!c) return `SELECT * FROM ${qualified}`
  switch (clause) {
    case 'WHERE':
      return `SELECT * FROM ${qualified} WHERE ${c}`
    case 'ORDER BY':
      return `SELECT * FROM ${qualified} ORDER BY ${c}`
    case 'LIMIT':
      return `SELECT * FROM ${qualified} LIMIT ${c}`
    case 'GROUP BY':
      return `SELECT * FROM ${qualified} GROUP BY ${c}`
    case 'HAVING':
      // ponytail: HAVING without GROUP BY is engine-dependent; CUSTOM covers the rest.
      return `SELECT * FROM ${qualified} HAVING ${c}`
    case 'CUSTOM':
      return c
  }
}

const MiniSqlEditor = lazy(() =>
  import('./MiniSqlEditor').then((m) => ({ default: m.MiniSqlEditor })),
)

interface ColumnSqlBarProps {
  clause: Clause
  value: string
  builtQuery: string
  columns: string[]
  error: string | null
  loading: boolean
  onClauseChange: (clause: Clause) => void
  onChange: (value: string) => void
  onApply: () => void
  onClear: () => void
}

export function ColumnSqlBar({
  clause,
  value,
  builtQuery,
  columns,
  error,
  loading,
  onClauseChange,
  onChange,
  onApply,
  onClear,
}: ColumnSqlBarProps) {
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <select
          className={styles.clause}
          value={clause}
          onChange={(e) => onClauseChange(e.target.value as Clause)}
          aria-label="SQL clause"
        >
          {CLAUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className={styles.editor}>
          <Suspense
            fallback={
              <input
                className={styles.fallback}
                value={value}
                placeholder="filter…"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onApply()
                }}
              />
            }
          >
            <MiniSqlEditor
              value={value}
              isDark={isDark}
              columns={columns}
              onChange={onChange}
              onApply={onApply}
            />
          </Suspense>
        </div>
        {loading ? <span className={styles.spinner} aria-label="Running" /> : null}
        <button
          type="button"
          className={styles.iconBtn}
          title={builtQuery}
          aria-label="Run query"
          onClick={onApply}
        >
          <IconPlayerPlay size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Clear filter"
          title="Clear filter and reload"
          disabled={value.length === 0}
          onClick={onClear}
        >
          <IconX size={14} />
        </button>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  )
}
