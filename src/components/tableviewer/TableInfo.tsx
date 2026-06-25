import { useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import type { ForeignKeyInfo, IndexInfo, TableDetails } from '@shared/ipc'
import type { TableTabProps } from './TableViewer'
import styles from './TableInfo.module.css'

export function TableInfo({ connectionId, database, schema, table }: TableTabProps) {
  const [details, setDetails] = useState<TableDetails | null>(null)
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [fks, setFks] = useState<ForeignKeyInfo[]>([])

  useEffect(() => {
    let cancelled = false
    const ref = { connectionId, database, schema, table }
    void Promise.all([
      api().schema.getTableInfo(ref),
      api().schema.getIndexes(ref),
      api().schema.getForeignKeys(ref),
    ]).then(([info, idx, fk]) => {
      if (cancelled) return
      if (info.success) setDetails(info.data)
      if (idx.success) setIndexes(idx.data)
      if (fk.success) setFks(fk.data)
    })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table])

  function Field({ label, value }: { label: string; value?: string | number }) {
    if (value === undefined || value === '') return null
    return (
      <div className={styles.field}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h3 className={styles.title}>Overview</h3>
        <Field label="Name" value={table} />
        <Field label="Schema" value={schema} />
        <Field label="Owner" value={details?.owner} />
        <Field label="Rows" value={details?.rowCount?.toLocaleString()} />
        <Field label="Size" value={details?.sizePretty} />
        <Field label="Comment" value={details?.comment} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.title}>Indexes</h3>
        {indexes.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <ul className={styles.list}>
            {indexes.map((i) => (
              <li key={i.name} className={styles.item}>
                <span className={styles.itemName}>{i.name}</span>
                <span className={styles.itemMeta}>
                  {i.unique ? 'unique · ' : ''}
                  {i.columns.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.title}>Foreign Keys</h3>
        {fks.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <ul className={styles.list}>
            {fks.map((f, i) => (
              <li key={`${f.column}-${i}`} className={styles.item}>
                <span className={styles.itemName}>{f.column}</span>
                <span className={styles.itemMeta}>
                  → {f.referencedTable}.{f.referencedColumn}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
