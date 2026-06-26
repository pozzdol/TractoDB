import { useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import type { TableDetails } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

export function PropertiesInfo({ connectionId, database, schema, table }: TableTabProps) {
  const [details, setDetails] = useState<TableDetails | null>(null)

  useEffect(() => {
    let cancelled = false
    void api()
      .schema.getTableInfo({ connectionId, database, schema, table })
      .then((r) => {
        if (!cancelled && r.success) setDetails(r.data)
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
    <div className={styles.info}>
      <section className={styles.section}>
        <h3 className={styles.title}>Overview</h3>
        <Field label="Name" value={table} />
        <Field label="Schema" value={schema} />
        <Field label="Owner" value={details?.owner} />
        <Field label="Rows" value={details?.rowCount?.toLocaleString()} />
        <Field label="Size" value={details?.sizePretty} />
        <Field label="Comment" value={details?.comment} />
      </section>
    </div>
  )
}
