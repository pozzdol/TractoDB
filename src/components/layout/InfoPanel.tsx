import { useEffect, useState } from 'react'
import { IconKey, IconLink, IconLock, IconMinus } from '@tabler/icons-react'
import { useTabStore } from '@/store/tabStore'
import { useConnectionStore } from '@/store/connectionStore'
import { api } from '@/store/ipcClient'
import { databaseTypeMeta } from '@/types/connection'
import type { ColumnInfo } from '@/types/schema'
import styles from './InfoPanel.module.css'

/** Resolve the active table (connection + database + table) from the active tab. */
function useActiveContext() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const fallbackId = useConnectionStore((s) => s.activeConnectionId)
  const connectionId = activeTab?.connectionId ?? fallbackId
  const conn = useConnectionStore((s) =>
    s.connections.find((c) => c.config.id === connectionId),
  )
  const table =
    activeTab?.type === 'table-browser'
      ? { database: activeTab.database, table: activeTab.table }
      : null
  return { conn, table }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value} title={value}>
        {value}
      </span>
    </div>
  )
}

function columnIcon(c: ColumnInfo) {
  if (c.isPrimaryKey) return <IconKey size={12} className={styles.pk} />
  if (c.isForeignKey) return <IconLink size={12} className={styles.fk} />
  if (c.nullable) return <IconMinus size={12} className={styles.nullable} />
  return null
}

export function InfoPanel() {
  const { conn, table } = useActiveContext()
  const [columns, setColumns] = useState<ColumnInfo[]>([])

  const connectionId = conn?.config.id
  const connected = conn?.status === 'connected'
  const database = table?.database
  const tableName = table?.table

  useEffect(() => {
    if (!connectionId || !connected || !database || !tableName) {
      setColumns([])
      return
    }
    let cancelled = false
    void api()
      .schema.listColumns(connectionId, database, tableName)
      .then((r) => {
        if (!cancelled && r.success) setColumns(r.data)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, connected, database, tableName])

  if (!conn) {
    return (
      <div className={styles.empty}>
        Select a connection to see details.
      </div>
    )
  }

  const cfg = conn.config
  const meta = databaseTypeMeta(cfg.type)
  const endpoint = meta.usesFile
    ? (cfg.filePath ?? '—')
    : `${cfg.host ?? 'localhost'}:${cfg.port ?? meta.defaultPort ?? ''}`

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Connection</h3>
        <Field label="Name" value={cfg.name} />
        <Field label="Type" value={meta.label} />
        <Field label={meta.usesFile ? 'File' : 'Host'} value={endpoint} />
        {cfg.database ? <Field label="Database" value={cfg.database} /> : null}
        <Field label="Status" value={conn.status} />
        {conn.databaseVersion ? <Field label="Version" value={conn.databaseVersion} /> : null}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <IconLock size={12} /> SSH Tunnel
        </h3>
        <p className={styles.muted}>Not configured (v2).</p>
      </section>

      {table ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Columns — {tableName}</h3>
          {columns.length === 0 ? (
            <p className={styles.muted}>No columns.</p>
          ) : (
            <ul className={styles.columns}>
              {columns.map((c) => (
                <li key={c.name} className={styles.column}>
                  <span className={styles.colIcon}>{columnIcon(c)}</span>
                  <span className={styles.colName} title={c.name}>
                    {c.name}
                  </span>
                  <span className={styles.colType}>{c.dataType}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
