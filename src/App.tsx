import { useEffect } from 'react'
import { TitleBar } from '@/components/layout/TitleBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { SidebarPanel } from '@/components/layout/SidebarPanel'
import { RightPanel } from '@/components/layout/RightPanel'
import { InfoPanel } from '@/components/layout/InfoPanel'
import { ResizeHandle } from '@/components/layout/ResizeHandle'
import { RESULTS, RIGHT_PANEL, SIDEBAR } from '@/components/layout/panelConstraints'
import { ConnectionTree } from '@/components/sidebar/ConnectionTree'
import { TabBar } from '@/components/tabs/TabBar'
import { QueryView } from '@/components/editor/QueryView'
import { ResultsPanel } from '@/components/editor/ResultsPanel'
import { TableViewer } from '@/components/tableviewer/TableViewer'
import { ConnectionForm } from '@/components/connection/ConnectionForm'
import { BackupWizard } from '@/components/backup/BackupWizard'
import { RestoreWizard } from '@/components/backup/RestoreWizard'
import { ClientPathModal } from '@/components/backup/ClientPathModal'
import { PreferencesModal } from '@/components/settings/PreferencesModal'
import { useResizable } from '@/hooks/useResizable'
import { useUiStore } from '@/store/uiStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useQueryStore } from '@/store/queryStore'
import { api } from '@/store/ipcClient'
import styles from './App.module.css'

export default function App() {
  const hydrate = useUiStore((s) => s.hydrate)
  const layout = useUiStore((s) => s.layout)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth)
  const setResultsHeight = useUiStore((s) => s.setResultsHeight)

  const connectionFormOpen = useUiStore((s) => s.connectionForm.open)

  const secretsBackend = useUiStore((s) => s.secretsBackend)
  const secretsWarningDismissed = useUiStore((s) => s.preferences.secretsWarningDismissed)
  const dismissSecretsWarning = useUiStore((s) => s.dismissSecretsWarning)
  const showSecretsWarning = secretsBackend === 'encrypted-file' && !secretsWarningDismissed

  const backupModal = useUiStore((s) => s.backupModal)
  const clientPathOpen = useUiStore((s) => s.clientPathOpen)
  const preferencesOpen = useUiStore((s) => s.preferencesOpen)

  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const activeExecution = useQueryStore((s) => (activeTab ? s.byTab[activeTab.id] : undefined))
  const activeConnectionName = useConnectionStore((s) => {
    const active = s.connections.find((c) => c.config.id === s.activeConnectionId)
    return active?.config.name ?? null
  })

  useEffect(() => {
    let title = 'TractoDB'
    if (activeConnectionName) {
      title += ` — ${activeConnectionName}`
      if (activeTab) title += ` · ${activeTab.title}`
    }
    document.title = title
  }, [activeConnectionName, activeTab])

  useEffect(() => {
    void hydrate()
    void useTabStore.getState().restore()
  }, [hydrate])

  // Global tab shortcuts: Ctrl/Cmd+T new query, Ctrl/Cmd+W close active tab.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === ',') {
        e.preventDefault()
        useUiStore.getState().openPreferences()
      } else if (key === 't') {
        e.preventDefault()
        useTabStore.getState().openQueryTab({
          connectionId: useConnectionStore.getState().activeConnectionId,
        })
      } else if (key === 'w') {
        const id = useTabStore.getState().activeTabId
        if (id) {
          e.preventDefault()
          useTabStore.getState().closeTab(id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Native menu (Database → Tools → Backup/Restore) targets the active connection.
  useEffect(() => {
    const unsubscribe = api().menu.onAction((action) => {
      const cs = useConnectionStore.getState()
      const conn = cs.connections.find((c) => c.config.id === cs.activeConnectionId)
      if (!conn) return
      const type = conn.config.type
      if (type !== 'postgresql' && type !== 'mysql') return
      const target = {
        connectionId: conn.config.id,
        databaseType: type,
        database: cs.activeDatabase ?? conn.config.database ?? '',
      }
      const ui = useUiStore.getState()
      if (action === 'backup') ui.openBackup(target)
      else ui.openRestore(target)
    })
    return unsubscribe
  }, [])

  const sidebar = useResizable({
    axis: 'x',
    value: layout.sidebarWidth,
    min: SIDEBAR.min,
    max: SIDEBAR.max,
    onCommit: setSidebarWidth,
  })
  const right = useResizable({
    axis: 'x',
    value: layout.rightPanelWidth,
    min: RIGHT_PANEL.min,
    max: RIGHT_PANEL.max,
    invert: true,
    onCommit: setRightPanelWidth,
  })
  const results = useResizable({
    axis: 'y',
    value: layout.resultsPanelHeight,
    min: RESULTS.min,
    max: RESULTS.max,
    invert: true,
    onCommit: setResultsHeight,
  })

  return (
    <>
      <TitleBar />

      {showSecretsWarning && (
        <div className={styles.banner} role="status">
          <span>
            OS keychain unavailable — connection passwords are stored in an
            AES-encrypted file. Install <code>libsecret</code> for keychain storage.
          </span>
          <button type="button" className={styles.bannerDismiss} onClick={dismissSecretsWarning}>
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.body}>
        {!layout.sidebarCollapsed && (
          <>
            <SidebarPanel width={sidebar.size}>
              <ConnectionTree />
            </SidebarPanel>
            <ResizeHandle axis="x" handleProps={sidebar.handleProps} dragging={sidebar.dragging} />
          </>
        )}

        <main className={styles.center}>
          <TabBar />
          {activeTab === null ? (
            <div className={styles.editor}>
              <span className={styles.placeholder}>
                No tab open — press Ctrl+T for a new query, or click a table.
              </span>
            </div>
          ) : activeTab.type === 'table-viewer' ? (
            <TableViewer key={activeTab.id} tab={activeTab} />
          ) : (
            <>
              <QueryView key={activeTab.id} tab={activeTab} />
              <ResizeHandle
                axis="y"
                handleProps={results.handleProps}
                dragging={results.dragging}
              />
              <div className={styles.results} style={{ height: results.size }}>
                <ResultsPanel
                  execution={activeExecution}
                  onLoadMore={() => {
                    if (activeTab) void useQueryStore.getState().loadMore(activeTab.id)
                  }}
                />
              </div>
            </>
          )}
        </main>

        {!layout.rightPanelCollapsed && (
          <>
            <ResizeHandle axis="x" handleProps={right.handleProps} dragging={right.dragging} />
            <RightPanel width={right.size}>
              <InfoPanel />
            </RightPanel>
          </>
        )}
      </div>

      <StatusBar />

      {backupModal?.mode === 'backup' && <BackupWizard />}
      {backupModal?.mode === 'restore' && <RestoreWizard />}
      {clientPathOpen && <ClientPathModal />}
      {preferencesOpen && <PreferencesModal />}

      {connectionFormOpen && <ConnectionForm />}
    </>
  )
}
