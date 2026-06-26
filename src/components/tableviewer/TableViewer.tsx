import { useState } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import type { TableViewerTab } from '@/store/tabStore'
import type { DatabaseType } from '@/types/connection'
import { TableData } from './TableData'
import { PropertiesPanel, type Section } from './properties/PropertiesPanel'
import styles from './TableViewer.module.css'

export interface TableTabProps {
  tabId: string
  connectionId: string
  database: string
  schema?: string
  table: string
  dbType: DatabaseType
  readOnly: boolean
}

type SubTab = 'data' | 'properties'
const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'properties', label: 'Properties' },
]

export function TableViewer({ tab }: { tab: TableViewerTab }) {
  const connectionId = tab.connectionId
  const conn = useConnectionStore((s) => s.connections.find((c) => c.config.id === connectionId))
  const [sub, setSub] = useState<SubTab>('data')
  // Lifted out of PropertiesPanel so the active section (and its loaded
  // indexes/FK/triggers) survives switching to the Data tab and back.
  const [propertiesSection, setPropertiesSection] = useState<Section>('columns')

  if (!connectionId || !conn || conn.status !== 'connected') {
    return <div className={styles.closed}>Connection is not open. Connect to view this table.</div>
  }

  const readOnly = conn.config.environment === 'production'
  const props: TableTabProps = {
    tabId: tab.id,
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
        {/* Kept mounted (display:none when hidden) so section state persists. */}
        <div style={{ display: sub === 'properties' ? 'contents' : 'none' }}>
          <PropertiesPanel
            {...props}
            activeSection={propertiesSection}
            onSectionChange={setPropertiesSection}
          />
        </div>
      </div>
    </div>
  )
}
