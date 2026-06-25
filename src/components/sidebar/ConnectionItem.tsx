import { IconDatabase } from '@tabler/icons-react'
import type { MouseEvent } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { databaseTypeMeta } from '@/types/connection'
import type { ConnectionState, ConnectionStatus } from '@/types/connection'
import { TreeRow } from './TreeRow'
import { SchemaTree, type DatabaseContextHandler, type TableContextHandler } from './SchemaTree'
import styles from './ConnectionItem.module.css'

const DOT_CLASS: Record<ConnectionStatus, string> = {
  connected: styles.connected ?? '',
  connecting: styles.connecting ?? '',
  disconnected: styles.disconnected ?? '',
  error: styles.error ?? '',
}

interface ConnectionItemProps {
  connection: ConnectionState
  onConnectionContextMenu: (e: MouseEvent, id: string) => void
  onTableContextMenu: TableContextHandler
  onDatabaseContextMenu: DatabaseContextHandler
}

export function ConnectionItem({
  connection,
  onConnectionContextMenu,
  onTableContextMenu,
  onDatabaseContextMenu,
}: ConnectionItemProps) {
  const toggleConnection = useConnectionStore((s) => s.toggleConnection)
  const { config, status } = connection
  const meta = databaseTypeMeta(config.type)
  const connected = status === 'connected'

  return (
    <div role="group">
      <TreeRow
        depth={0}
        label={config.name}
        icon={<IconDatabase size={14} style={{ color: meta.colorVar }} />}
        expandable={connected}
        expanded={connection.expanded}
        loading={status === 'connecting'}
        title={status === 'error' ? connection.errorMessage : config.name}
        meta={
          <span
            className={`${styles.dot} ${DOT_CLASS[status]}`}
            aria-label={status}
          />
        }
        onActivate={() => void toggleConnection(config.id)}
        onToggle={() => void toggleConnection(config.id)}
        onContextMenu={(e) => onConnectionContextMenu(e, config.id)}
      />

      {connected && connection.expanded ? (
        connection.loadingSchema && connection.databases.length === 0 ? (
          <div className={styles.loading} style={{ paddingLeft: 8 + 14 + 12 }}>
            Loading…
          </div>
        ) : (
          <SchemaTree
            connectionId={config.id}
            databases={connection.databases}
            onTableContextMenu={onTableContextMenu}
            onDatabaseContextMenu={onDatabaseContextMenu}
          />
        )
      ) : null}
    </div>
  )
}
