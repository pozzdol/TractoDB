import { useEffect, useState, type MouseEvent } from 'react'
import { IconCopy, IconDatabase, IconMinus, IconSquare, IconX } from '@tabler/icons-react'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useUiStore } from '@/store/uiStore'
import styles from './TitleBar.module.css'

const wc = () => window.tractodb.windowControls

type MenuName = 'File' | 'Edit' | 'View' | 'Database' | 'Tools' | 'Help'
const MENUS: MenuName[] = ['File', 'Edit', 'View', 'Database', 'Tools', 'Help']

export function TitleBar() {
  const isMac = window.tractodb.platform() === 'darwin'

  const [open, setOpen] = useState<{ name: MenuName; x: number; y: number } | null>(null)
  const [isMax, setIsMax] = useState(() => {
    try {
      return wc().isMaximized()
    } catch {
      return false
    }
  })

  useEffect(() => {
    const cb = (v: boolean): void => setIsMax(v)
    try {
      wc().onMaximized(cb)
    } catch {
      /* not in Electron */
    }
    return () => {
      try {
        wc().offMaximized(cb)
      } catch {
        /* noop */
      }
    }
  }, [])

  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const openConnectionForm = useUiStore((s) => s.openConnectionForm)
  const openPreferences = useUiStore((s) => s.openPreferences)
  const openClientPath = useUiStore((s) => s.openClientPath)
  const openBackup = useUiStore((s) => s.openBackup)
  const openRestore = useUiStore((s) => s.openRestore)
  const openQueryTab = useTabStore((s) => s.openQueryTab)
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const active = useConnectionStore((s) => s.connections.find((c) => c.config.id === s.activeConnectionId))
  const activeDatabase = useConnectionStore((s) => s.activeDatabase)
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)

  const connected = active?.status === 'connected'
  const backupTarget = (): { connectionId: string; databaseType: 'postgresql' | 'mysql'; database: string } | null => {
    const t = active?.config.type
    if (!active || (t !== 'postgresql' && t !== 'mysql')) return null
    return { connectionId: active.config.id, databaseType: t, database: activeDatabase ?? active.config.database ?? '' }
  }
  const exec = (cmd: string): void => {
    try {
      document.execCommand(cmd)
    } catch {
      /* noop */
    }
  }

  function items(name: MenuName): ContextMenuItem[] {
    switch (name) {
      case 'File':
        return [
          { label: 'New Query Tab', shortcut: 'Ctrl+T', onClick: () => openQueryTab({ connectionId: activeId }) },
          { label: 'Open SQL File…', onClick: () => void window.tractodb.dialog.open({ title: 'Open SQL file', filters: [{ name: 'SQL', extensions: ['sql'] }] }) },
          { label: 's1', separator: true },
          { label: 'New Connection…', onClick: () => openConnectionForm() },
          { label: 's2', separator: true },
          { label: 'Preferences…', shortcut: 'Ctrl+,', onClick: openPreferences },
          { label: 's3', separator: true },
          { label: 'Quit', shortcut: 'Ctrl+Q', onClick: () => wc().close() },
        ]
      case 'Edit':
        return [
          { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => exec('copy') },
          { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => exec('paste') },
          { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => exec('selectAll') },
          { label: 's1', separator: true },
          { label: 'Find', shortcut: 'Ctrl+F', disabled: true },
        ]
      case 'View':
        return [
          { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', onClick: toggleSidebar },
          { label: 'Toggle Right Panel', onClick: toggleRightPanel },
          { label: 'Toggle Theme', onClick: toggleTheme },
          { label: 's1', separator: true },
          { label: 'Zoom In', shortcut: 'Ctrl+=', onClick: () => wc().zoomIn() },
          { label: 'Zoom Out', shortcut: 'Ctrl+-', onClick: () => wc().zoomOut() },
          { label: 'Reset Zoom', shortcut: 'Ctrl+0', onClick: () => wc().zoomReset() },
          { label: 's2', separator: true },
          { label: 'Toggle Full Screen', shortcut: 'F11', onClick: () => wc().toggleFullscreen() },
        ]
      case 'Database':
        return [
          { label: 'Connect…', disabled: !activeId || connected, onClick: () => activeId && void connect(activeId) },
          { label: 'Disconnect', disabled: !connected, onClick: () => activeId && void disconnect(activeId) },
          { label: 's1', separator: true },
          { label: 'New Query', shortcut: 'Ctrl+T', onClick: () => openQueryTab({ connectionId: activeId }) },
          { label: 'Backup Database…', disabled: !backupTarget(), onClick: () => { const t = backupTarget(); if (t) openBackup(t) } },
          { label: 'Restore Database…', disabled: !backupTarget(), onClick: () => { const t = backupTarget(); if (t) openRestore(t) } },
        ]
      case 'Tools':
        return [
          { label: 'Preferences…', shortcut: 'Ctrl+,', onClick: openPreferences },
          { label: 's1', separator: true },
          { label: 'Local Client Settings…', onClick: openClientPath },
        ]
      case 'Help':
        return [
          { label: 'About TractoDB', onClick: () => undefined },
          { label: 's1', separator: true },
          { label: 'View on GitHub', onClick: () => undefined },
        ]
    }
  }

  function onMenuClick(e: MouseEvent, name: MenuName): void {
    const r = e.currentTarget.getBoundingClientRect()
    setOpen((prev) => (prev?.name === name ? prev : { name, x: Math.round(r.left), y: Math.round(r.bottom) }))
  }
  function onMenuHover(e: MouseEvent, name: MenuName): void {
    if (!open || open.name === name) return
    const r = e.currentTarget.getBoundingClientRect()
    setOpen({ name, x: Math.round(r.left), y: Math.round(r.bottom) })
  }
  function onBarDoubleClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('button')) return
    wc().maximize()
  }

  return (
    <header className={styles.bar} onDoubleClick={onBarDoubleClick}>
      {isMac ? <span className={styles.macPad} /> : null}
      <span className={styles.brand}>
        <IconDatabase size={16} className={styles.appIcon} />
        <span className={styles.appName}>TractoDB</span>
        {active ? (
          <span className={styles.crumbs}>
            <span className={styles.sep}>›</span>
            <span className={styles.crumbName}>{active.config.name}</span>
            {activeDatabase ? (
              <>
                <span className={styles.sep}>›</span>
                <span className={styles.crumb}>{activeDatabase}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </span>

      <nav className={styles.menubar}>
        {MENUS.map((name) => (
          <button
            key={name}
            type="button"
            className={`${styles.menuItem} ${open?.name === name ? styles.menuActive : ''}`}
            onClick={(e) => onMenuClick(e, name)}
            onMouseEnter={(e) => onMenuHover(e, name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <span className={styles.spacer} />

      {!isMac ? (
        <div className={styles.windowControls}>
          <button type="button" className={styles.winBtn} aria-label="Minimize" onClick={() => wc().minimize()}>
            <IconMinus size={14} />
          </button>
          <button
            type="button"
            className={styles.winBtn}
            aria-label={isMax ? 'Restore' : 'Maximize'}
            onClick={() => wc().maximize()}
          >
            {isMax ? <IconCopy size={12} /> : <IconSquare size={12} />}
          </button>
          <button type="button" className={`${styles.winBtn} ${styles.closeBtn}`} aria-label="Close" onClick={() => wc().close()}>
            <IconX size={14} />
          </button>
        </div>
      ) : null}

      {open ? <ContextMenu x={open.x} y={open.y} items={items(open.name)} onClose={() => setOpen(null)} /> : null}
    </header>
  )
}
