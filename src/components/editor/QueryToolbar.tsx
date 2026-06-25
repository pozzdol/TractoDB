import { IconDownload, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import type { QueryStatus } from '@/store/queryStore'
import styles from './QueryToolbar.module.css'

interface QueryToolbarProps {
  connectionName?: string
  database?: string | null
  status: QueryStatus
  canRun: boolean
  onRun: () => void
  onStop: () => void
}

export function QueryToolbar({
  connectionName,
  database,
  status,
  canRun,
  onRun,
  onStop,
}: QueryToolbarProps) {
  const running = status === 'running'
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {connectionName ? (
          <span className={styles.badge}>
            {connectionName}
            {database ? <span className={styles.schema}>/{database}</span> : null}
          </span>
        ) : (
          <span className={styles.noConn}>No connection</span>
        )}
      </div>
      <div className={styles.right}>
        {running ? (
          <Button variant="danger" onClick={onStop}>
            <IconPlayerStop size={14} />
            Stop
          </Button>
        ) : (
          <Button variant="primary" disabled={!canRun} onClick={onRun}>
            <IconPlayerPlay size={14} />
            Run
          </Button>
        )}
        <IconButton label="Export (coming in v2)" disabled>
          <IconDownload size={16} />
        </IconButton>
      </div>
    </div>
  )
}
