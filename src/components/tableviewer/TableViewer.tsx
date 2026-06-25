import { useState } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import type { TableViewerTab } from '@/store/tabStore'
import type { DatabaseType } from '@/types/connection'
import { TableData } from './TableData'
import { TableDDL } from './TableDDL'
import { TableColumns } from './TableColumns'
import { TableInfo } from './TableInfo'
import styles from './TableViewer.module.css'

export interface TableTabProps {
  connectionId: string
  database: string
  schema?: string
  table: string
  dbType: DatabaseType
  readOnly: boolean
}

type SubTab = 'data' | 'ddl' | 'columns' | 'info'
const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'ddl', label: 'DDL' },
  { id: 'columns', label: 'Columns' },
  { id: 'info', label: 'Info' },
]

export function TableViewer({ tab }: { tab: TableViewerTab }) {
  const connectionId = tab.connectionId
  const conn = useConnectionStore((s) => s.connections.find((c) => c.config.id === connectionId))
  const [sub, setSub] = useState<SubTab>('data')

  if (!connectionId || !conn || conn.status !== 'connected') {
    return <div className={styles.closed}>Connection is not open. Connect to view this table.</div>
  }

  const readOnly = conn.config.environment === 'production'
  const props: TableTabProps = {
    connectionId,
    database: tab.database,
    schema: tab.schema,
    table: tab.table,
    dbType: conn.config.type,
    readOnly,
  }

  return (
    <div className={styles.view}>
      {readOnly ? (
        <div className={styles.prodBanner}>⚠ Production — read-only mode</div>
      ) : null}
      <div className={styles.subTabs}>
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.subTab} ${sub === t.id ? styles.active : ''}`}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {sub === 'data' && <TableData {...props} />}
        {sub === 'ddl' && <TableDDL {...props} />}
        {sub === 'columns' && <TableColumns {...props} />}
        {sub === 'info' && <TableInfo {...props} />}
      </div>
    </div>
  )
}
