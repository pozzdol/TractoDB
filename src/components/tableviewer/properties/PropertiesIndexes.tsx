import { useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import type { IndexInfo } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

function check(b: boolean): string {
  return b ? '✓' : ''
}

export function PropertiesIndexes({ connectionId, database, schema, table }: TableTabProps) {
  const [indexes, setIndexes] = useState<IndexInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setIndexes(null)
    void api()
      .schema.getIndexes({ connectionId, database, schema, table })
      .then((r) => {
        if (!cancelled && r.success) setIndexes(r.data)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table])

  if (indexes && indexes.length === 0) {
    return <div className={styles.empty}>No indexes found</div>
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Columns</th>
            <th className={styles.center}>Unique</th>
            <th className={styles.center}>Primary</th>
          </tr>
        </thead>
        <tbody>
          {(indexes ?? []).map((i) => (
            <tr key={i.name}>
              <td className={styles.mono}>{i.name}</td>
              <td>{i.type ?? '—'}</td>
              <td className={styles.mono}>{i.columns.join(', ')}</td>
              <td className={styles.center}>{check(i.unique)}</td>
              <td className={styles.center}>{check(i.isPrimary ?? false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
