import { Suspense, lazy, useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import type { RelatedFunctionInfo } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

const SqlReadOnly = lazy(() =>
  import('@/components/editor/SqlReadOnly').then((m) => ({ default: m.SqlReadOnly })),
)

export function PropertiesFunctions({
  connectionId,
  database,
  schema,
  table,
  dbType,
}: TableTabProps) {
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const [fns, setFns] = useState<RelatedFunctionInfo[] | null>(null)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (dbType === 'sqlite') return
    let cancelled = false
    setFns(null)
    setSelected(0)
    void api()
      .schema.getRelatedFunctions({ connectionId, database, schema, table })
      .then((r) => {
        if (!cancelled && r.success) setFns(r.data)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table, dbType])

  if (dbType === 'sqlite') {
    return <div className={styles.empty}>Functions are not supported for SQLite databases</div>
  }
  if (fns && fns.length === 0) {
    return <div className={styles.empty}>No related functions found</div>
  }

  const active = fns?.[selected]

  return (
    <div className={styles.split}>
      <div className={styles.splitList}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Arguments</th>
              <th>Return Type</th>
            </tr>
          </thead>
          <tbody>
            {(fns ?? []).map((f, i) => (
              <tr
                key={f.name}
                className={`${styles.row} ${i === selected ? styles.rowActive : ''}`}
                onClick={() => setSelected(i)}
              >
                <td className={styles.mono}>{f.name}</td>
                <td className={styles.muted}>{f.arguments}</td>
                <td>{f.returnType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.editor}>
        {active ? (
          <Suspense fallback={<div className={styles.empty}>Loading…</div>}>
            <SqlReadOnly value={active.definition} isDark={isDark} />
          </Suspense>
        ) : null}
      </div>
    </div>
  )
}
