import {
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSquarePlus,
  IconSun,
  IconTerminal2,
} from '@tabler/icons-react'
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

  const activeName = useConnectionStore((s) => {
    const active = s.connections.find((c) => c.config.id === s.activeConnectionId)
    return active?.config.name ?? null
  })
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const openQueryTab = useTabStore((s) => s.openQueryTab)

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
