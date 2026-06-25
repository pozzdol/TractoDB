import { IconLock } from '@tabler/icons-react'
import type { MouseEvent } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { DatabaseIcon } from '@/components/ui/DatabaseIcon'
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
  const connected = status === 'connected'
  const isProd = config.environment === 'production'

  return (
    <div role="group">
      <TreeRow
        depth={0}
        label={config.name}
        danger={isProd}
        icon={<DatabaseIcon type={config.type} size={16} />}
        expandable={connected}
        expanded={connection.expanded}
        loading={status === 'connecting'}
        title={status === 'error' ? connection.errorMessage : config.name}
        meta={
          <>
            {isProd ? <IconLock size={11} className={styles.lock} /> : null}
            {isProd ? <span className={styles.prodBadge}>PROD</span> : null}
            <span
              className={`${styles.dot} ${DOT_CLASS[status]} ${isProd ? styles.dotProd : ''}`}
              aria-label={status}
            />
          </>
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
            dbType={config.type}
            databases={connection.databases}
            onTableContextMenu={onTableContextMenu}
            onDatabaseContextMenu={onDatabaseContextMenu}
          />
        )
      ) : null}
    </div>
  )
}
