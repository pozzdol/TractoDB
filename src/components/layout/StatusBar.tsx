import { useConnectionStore } from '@/store/connectionStore'
import { DatabaseIcon } from '@/components/ui/DatabaseIcon'
import type { ConnectionStatus } from '@/types/connection'
import styles from './StatusBar.module.css'

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connected: styles.dotConnected ?? '',
  connecting: styles.dotConnecting ?? '',
  disconnected: styles.dotDisconnected ?? '',
  error: styles.dotError ?? '',
}

export function StatusBar() {
  const active = useConnectionStore((s) =>
    s.connections.find((c) => c.config.id === s.activeConnectionId),
  )
  const status: ConnectionStatus = active?.status ?? 'disconnected'
  const database = active?.config.database

  return (
    <footer className={styles.bar}>
      <div className={styles.section}>
        <span className={`${styles.dot} ${STATUS_CLASS[status]}`} aria-hidden="true" />
        {active ? <DatabaseIcon type={active.config.type} size={12} /> : null}
        <span>{active ? active.config.name : 'Not connected'}</span>
        {database ? (
          <>
            <span className={styles.divider} aria-hidden="true">
              |
            </span>
            <span>{database}</span>
          </>
        ) : null}
        {status === 'error' && active?.errorMessage ? (
          <>
            <span className={styles.divider} aria-hidden="true">
              |
            </span>
            <span className={styles.error}>{active.errorMessage}</span>
          </>
        ) : null}
      </div>

      <div className={styles.section}>
        <span>UTF-8</span>
      </div>
    </footer>
  )
}
