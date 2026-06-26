import { useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import { useTabStore } from '@/store/tabStore'
import type { ForeignKeyInfo } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

export function PropertiesFK({ connectionId, database, schema, table, dbType }: TableTabProps) {
  const openTableTab = useTabStore((s) => s.openTableTab)
  const [fks, setFks] = useState<ForeignKeyInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setFks(null)
    void api()
      .schema.getForeignKeys({ connectionId, database, schema, table })
      .then((r) => {
        if (!cancelled && r.success) setFks(r.data)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table])

  function openReferenced(fk: ForeignKeyInfo): void {
    // For MySQL the "schema" is the database; for SQLite there is no schema.
    const targetSchema = dbType === 'sqlite' ? undefined : fk.foreignSchema
    const targetDb = dbType === 'mysql' ? (fk.foreignSchema ?? database) : database
    openTableTab({ connectionId, database: targetDb, table: fk.referencedTable, schema: targetSchema })
  }

  if (fks && fks.length === 0) {
    return <div className={styles.empty}>No foreign keys defined</div>
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Constraint</th>
            <th>Column</th>
            <th>References</th>
            <th>On Update</th>
            <th>On Delete</th>
          </tr>
        </thead>
        <tbody>
          {(fks ?? []).map((fk, i) => {
            const ref = `${fk.foreignSchema ? `${fk.foreignSchema}.` : ''}${fk.referencedTable}(${fk.referencedColumn})`
            return (
              <tr key={`${fk.name ?? fk.column}-${i}`}>
                <td className={styles.mono}>{fk.name ?? ''}</td>
                <td className={styles.mono}>{fk.column}</td>
                <td>
                  <button type="button" className={styles.link} onClick={() => openReferenced(fk)}>
                    {ref}
                  </button>
                </td>
                <td>{fk.onUpdate ?? 'NO ACTION'}</td>
                <td>{fk.onDelete ?? 'NO ACTION'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
