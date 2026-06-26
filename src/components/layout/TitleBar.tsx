import {
  IconDatabaseExport,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSquarePlus,
  IconSun,
  IconTerminal2,
} from '@tabler/icons-react'
import type { BackupDatabaseType } from '@shared/ipc'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useUiStore } from '@/store/uiStore'
import { IconButton } from '@/components/ui/IconButton'
import styles from './TitleBar.module.css'

export function TitleBar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)
  const sidebarCollapsed = useUiStore((s) => s.layout.sidebarCollapsed)
  const rightPanelCollapsed = useUiStore((s) => s.layout.rightPanelCollapsed)
  const resolvedTheme = useUiStore((s) => s.resolvedTheme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const openConnectionForm = useUiStore((s) => s.openConnectionForm)
  const openClientPath = useUiStore((s) => s.openClientPath)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const openBackup = useUiStore((s) => s.openBackup)

  const active = useConnectionStore((s) =>
    s.connections.find((c) => c.config.id === s.activeConnectionId),
  )
  const activeDatabase = useConnectionStore((s) => s.activeDatabase)
  const activeName = active?.config.name ?? null
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const openQueryTab = useTabStore((s) => s.openQueryTab)

  // Quick "backup current database" — only for connected pg/mysql with a database.
  const backupType = active?.config.type
  const backupDb = activeDatabase ?? active?.config.database ?? null
  const canBackup =
    active?.status === 'connected' &&
    (backupType === 'postgresql' || backupType === 'mysql') &&
    Boolean(backupDb)
  function quickBackup(): void {
    if (!active || !canBackup || !backupDb) return
    openBackup({
      connectionId: active.config.id,
      databaseType: backupType as BackupDatabaseType,
      database: backupDb,
      allTables: true,
    })
  }

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.wordmark}>TractoDB</span>
        <IconButton
          label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          active={!sidebarCollapsed}
          onClick={toggleSidebar}
        >
          <IconLayoutSidebar size={16} />
        </IconButton>
        <IconButton
          label={rightPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
          active={!rightPanelCollapsed}
          onClick={toggleRightPanel}
        >
          <IconLayoutSidebarRight size={16} />
        </IconButton>
      </div>

      <div className={styles.center}>
        {activeName ? (
          <span className={styles.connection}>{activeName}</span>
        ) : (
          <span className={styles.connectionMuted}>No connection</span>
        )}
      </div>

      <div className={styles.right}>
        <IconButton label="New connection" text="New Connection" onClick={() => openConnectionForm()}>
          <IconPlus size={16} />
        </IconButton>
        <IconButton
          label="New query"
          text="Query"
          onClick={() => openQueryTab({ connectionId: activeId })}
        >
          <IconSquarePlus size={16} />
        </IconButton>
        <IconButton label="Backup current database" disabled={!canBackup} onClick={quickBackup}>
          <IconDatabaseExport size={16} />
        </IconButton>
        <IconButton
          label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {resolvedTheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </IconButton>
        <IconButton label="Native client paths" onClick={openClientPath}>
          <IconTerminal2 size={16} />
        </IconButton>
        <IconButton label="Preferences (Ctrl+,)" onClick={openPreferences}>
          <IconSettings size={16} />
        </IconButton>
      </div>
    </header>
  )
}
