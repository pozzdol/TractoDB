import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  IconBolt,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFileCode,
  IconPlug,
  IconPlugOff,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import type { BackupDatabaseType, DatabaseType } from '@shared/ipc'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useUiStore } from '@/store/uiStore'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ConnectionItem } from './ConnectionItem'
import styles from './ConnectionTree.module.css'

interface MenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function ConnectionTree() {
  const connections = useConnectionStore((s) => s.connections)
  const loadConnections = useConnectionStore((s) => s.loadConnections)
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const refreshSchema = useConnectionStore((s) => s.loadDatabasesInternal)
  const openQueryTab = useTabStore((s) => s.openQueryTab)
  const openTableTab = useTabStore((s) => s.openTableTab)
  const openConnectionForm = useUiStore((s) => s.openConnectionForm)
  const openBackup = useUiStore((s) => s.openBackup)
  const openRestore = useUiStore((s) => s.openRestore)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  // Roving focus: Arrow Up/Down move between visible tree rows.
  function onTreeKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    )
    if (items.length === 0) return
    e.preventDefault()
    const index = items.findIndex((el) => el === document.activeElement)
    const next =
      e.key === 'ArrowDown'
        ? Math.min(items.length - 1, index + 1)
        : Math.max(0, index === -1 ? 0 : index - 1)
    items[next]?.focus()
  }

  function openConnectionMenu(e: MouseEvent, id: string): void {
    e.preventDefault()
    const conn = connections.find((c) => c.config.id === id)
    if (!conn) return
    const items: ContextMenuItem[] = []
    if (conn.status === 'connected') {
      items.push({ label: 'Disconnect', icon: <IconPlugOff size={14} />, onClick: () => void disconnect(id) })
      items.push({ label: 'Refresh', icon: <IconRefresh size={14} />, onClick: () => void refreshSchema(id) })
    } else {
      items.push({ label: 'Connect', icon: <IconPlug size={14} />, onClick: () => void connect(id) })
    }
    items.push({ label: 'sep', separator: true })
    items.push({ label: 'Edit', icon: <IconEdit size={14} />, onClick: () => openConnectionForm(id) })
    items.push({
      label: 'Delete',
      icon: <IconTrash size={14} />,
      danger: true,
      onClick: () => void removeConnection(id),
    })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openTableMenu(
    e: MouseEvent,
    connectionId: string,
    database: string,
    table: string,
  ): void {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Open Table',
          icon: <IconTable size={14} />,
          onClick: () => openTableTab({ connectionId, database, table }),
        },
        {
          label: 'New Query',
          icon: <IconFileCode size={14} />,
          onClick: () =>
            openQueryTab({
              connectionId,
              database,
              title: table,
              sql: `SELECT * FROM ${table} LIMIT 100;`,
            }),
        },
        { label: 'sep', separator: true },
        {
          label: 'Copy Name',
          icon: <IconCopy size={14} />,
          onClick: () => void navigator.clipboard.writeText(table),
        },
      ],
    })
  }

  function openDatabaseMenu(
    e: MouseEvent,
    connectionId: string,
    type: DatabaseType,
    database: string,
  ): void {
    e.preventDefault()
    // Backup/restore only applies to the native-CLI engines.
    if (type !== 'postgresql' && type !== 'mysql') return
    const databaseType: BackupDatabaseType = type
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Backup All Tables…',
          icon: <IconBolt size={14} />,
          onClick: () => openBackup({ connectionId, databaseType, database, allTables: true }),
        },
        { label: 'sep', separator: true },
        {
          label: 'Backup database',
          icon: <IconDownload size={14} />,
          onClick: () => openBackup({ connectionId, databaseType, database }),
        },
        {
          label: 'Restore database',
          icon: <IconUpload size={14} />,
          onClick: () => openRestore({ connectionId, databaseType, database }),
        },
      ],
    })
  }

  return (
    <div className={styles.tree}>
      <div className={styles.header}>
        <span className={styles.title}>Connections</span>
        <IconButton label="New connection" onClick={() => openConnectionForm()}>
          <IconPlus size={14} />
        </IconButton>
      </div>

      <div className={styles.body} ref={bodyRef} onKeyDown={onTreeKeyDown}>
        {connections.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No connections yet.</p>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => openConnectionForm()}
            >
              <IconPlus size={14} />
              Add a connection
            </button>
          </div>
        ) : (
          connections.map((conn) => (
            <ConnectionItem
              key={conn.config.id}
              connection={conn}
              onConnectionContextMenu={openConnectionMenu}
              onTableContextMenu={(e, database, table) =>
                openTableMenu(e, conn.config.id, database, table)
              }
              onDatabaseContextMenu={(e, database) =>
                openDatabaseMenu(e, conn.config.id, conn.config.type, database)
              }
            />
          ))
        )}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
