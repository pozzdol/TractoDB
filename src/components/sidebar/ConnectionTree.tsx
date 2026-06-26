import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  IconBolt,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFileCode,
  IconFolder,
  IconFolderPlus,
  IconPlug,
  IconPlugOff,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import type { BackupDatabaseType, ConnectionFolder, DatabaseType } from '@shared/ipc'
import { useConnectionStore, type SidebarNode } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useUiStore } from '@/store/uiStore'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ConnectionItem } from './ConnectionItem'
import { FolderItem, FOLDER_COLORS, FOLDER_COLOR_ORDER } from './FolderItem'
import styles from './ConnectionTree.module.css'

interface MenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

type DragRef = { type: 'folder' | 'connection'; id: string } | null

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1)

export function ConnectionTree() {
  const connections = useConnectionStore((s) => s.connections)
  const folders = useConnectionStore((s) => s.folders)
  const loadConnections = useConnectionStore((s) => s.loadConnections)
  const loadFolders = useConnectionStore((s) => s.loadFolders)
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const refreshSchema = useConnectionStore((s) => s.loadDatabasesInternal)
  const getSidebarTree = useConnectionStore((s) => s.getSidebarTree)
  const createFolder = useConnectionStore((s) => s.createFolder)
  const updateFolder = useConnectionStore((s) => s.updateFolder)
  const deleteFolder = useConnectionStore((s) => s.deleteFolder)
  const reorderItems = useConnectionStore((s) => s.reorderItems)
  const openQueryTab = useTabStore((s) => s.openQueryTab)
  const openTableTab = useTabStore((s) => s.openTableTab)
  const openConnectionForm = useUiStore((s) => s.openConnectionForm)
  const openBackup = useUiStore((s) => s.openBackup)
  const openRestore = useUiStore((s) => s.openRestore)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConnectionFolder | null>(null)
  const [dropTarget, setDropTarget] = useState<{ folderId: string; valid: boolean } | null>(null)
  const [rootInsert, setRootInsert] = useState<number | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const dragRef = useRef<DragRef>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadConnections()
    void loadFolders()
  }, [loadConnections, loadFolders])

  const tree = getSidebarTree()
  const directConnCount = (folderId: string): number =>
    connections.filter((c) => (c.config.folderId ?? null) === folderId).length
  const folderDepth = (f: ConnectionFolder): 0 | 1 => (f.parentId === null ? 0 : 1)
  const nextOrderIn = (folderId: string | null): number =>
    connections
      .filter((c) => (c.config.folderId ?? null) === folderId)
      .reduce((m, c) => Math.max(m, c.config.order ?? 0), -1) + 1

  function onTreeKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])
    if (items.length === 0) return
    e.preventDefault()
    const index = items.findIndex((el) => el === document.activeElement)
    const next =
      e.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index === -1 ? 0 : index - 1)
    items[next]?.focus()
  }

  // ── Drag and drop ───────────────────────────────────────────────────────────
  function startDrag(e: DragEvent, type: 'folder' | 'connection', id: string): void {
    dragRef.current = { type, id }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  function endDrag(): void {
    dragRef.current = null
    setDropTarget(null)
    setRootInsert(null)
  }
  function onFolderDragOver(e: DragEvent, folder: ConnectionFolder): void {
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()
    e.stopPropagation()
    let valid = true
    if (drag.type === 'folder') {
      // A folder may only nest into a ROOT folder, and not into itself.
      valid = drag.id !== folder.id && folder.parentId === null && !isDescendant(folder.id, drag.id)
    }
    e.dataTransfer.dropEffect = valid ? 'move' : 'none'
    setRootInsert(null)
    setDropTarget({ folderId: folder.id, valid })
  }
  function isDescendant(folderId: string, ofId: string): boolean {
    let f = folders.find((x) => x.id === folderId)
    while (f) {
      if (f.parentId === ofId) return true
      f = folders.find((x) => x.id === f?.parentId)
    }
    return false
  }
  function onFolderDrop(e: DragEvent, folder: ConnectionFolder): void {
    e.preventDefault()
    e.stopPropagation()
    const drag = dragRef.current
    setDropTarget(null)
    if (!drag) return
    if (drag.type === 'connection') {
      void reorderItems([{ type: 'connection', id: drag.id, parentId: folder.id, order: nextOrderIn(folder.id) }])
    } else {
      if (folder.parentId !== null || drag.id === folder.id || isDescendant(folder.id, drag.id)) {
        setShakeId(folder.id)
        setTimeout(() => setShakeId(null), 350)
        endDrag()
        return
      }
      const order =
        folders.filter((f) => f.parentId === folder.id).reduce((m, f) => Math.max(m, f.order), -1) + 1
      void reorderItems([{ type: 'folder', id: drag.id, parentId: folder.id, order }])
    }
    endDrag()
  }
  // Drop into the root area at a given insertion index → reindex all root items.
  function onRootDrop(index: number): void {
    const drag = dragRef.current
    setRootInsert(null)
    if (!drag) return
    const rootIds = tree.map((n) => (n.type === 'folder' ? n.data.id : n.data.config.id))
    const without = rootIds.filter((id) => id !== drag.id)
    const insertAt = Math.min(index, without.length)
    without.splice(insertAt, 0, drag.id)
    const items = without.map((id, order) => {
      const node = tree.find((n) => (n.type === 'folder' ? n.data.id : n.data.config.id) === id)
      const type = node?.type === 'connection' || drag.id === id ? (drag.id === id ? drag.type : node?.type) : node?.type
      return { type: (type ?? 'connection') as 'folder' | 'connection', id, parentId: null, order }
    })
    void reorderItems(items)
    endDrag()
  }

  // ── Context menus ────────────────────────────────────────────────────────────
  function moveToFolderItems(connId: string): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: '(No folder — root)', onClick: () => void reorderItems([{ type: 'connection', id: connId, parentId: null, order: nextOrderIn(null) }]) },
      { label: 'sep', separator: true },
    ]
    const roots = folders.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order)
    for (const root of roots) {
      items.push({
        label: root.name,
        icon: <IconFolder size={14} style={{ color: FOLDER_COLORS[root.color] }} />,
        onClick: () => void reorderItems([{ type: 'connection', id: connId, parentId: root.id, order: nextOrderIn(root.id) }]),
      })
      for (const child of folders.filter((f) => f.parentId === root.id).sort((a, b) => a.order - b.order)) {
        items.push({
          label: `  ${child.name}`,
          icon: <IconFolder size={14} style={{ color: FOLDER_COLORS[child.color] }} />,
          onClick: () => void reorderItems([{ type: 'connection', id: connId, parentId: child.id, order: nextOrderIn(child.id) }]),
        })
      }
    }
    return items
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
    items.push({ label: 'sep1', separator: true })
    items.push({ label: 'Move to Folder', icon: <IconFolder size={14} />, children: moveToFolderItems(id) })
    items.push({ label: 'sep2', separator: true })
    items.push({ label: 'Edit', icon: <IconEdit size={14} />, onClick: () => openConnectionForm(id) })
    items.push({
      label: 'Delete',
      icon: <IconTrash size={14} />,
      danger: true,
      onClick: () => void removeConnection(id),
    })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openFolderMenu(e: MouseEvent, folder: ConnectionFolder): void {
    e.preventDefault()
    const atMaxDepth = folder.parentId !== null
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Rename', icon: <IconEdit size={14} />, onClick: () => setRenamingId(folder.id) },
        {
          label: 'Change Color',
          children: FOLDER_COLOR_ORDER.map((color) => ({
            label: cap(color),
            icon: <span className={styles.swatch} style={{ backgroundColor: FOLDER_COLORS[color] }} />,
            onClick: () => void updateFolder(folder.id, { color }),
          })),
        },
        { label: 'sep1', separator: true },
        {
          label: 'New Connection in Folder',
          icon: <IconPlus size={14} />,
          onClick: () => openConnectionForm(null, folder.id),
        },
        {
          label: 'New Subfolder',
          icon: <IconFolderPlus size={14} />,
          disabled: atMaxDepth,
          onClick: () => setCreating({ parentId: folder.id }),
        },
        { label: 'sep2', separator: true },
        {
          label: 'Delete Folder',
          icon: <IconTrash size={14} />,
          danger: true,
          onClick: () => setDeleteTarget(folder),
        },
      ],
    })
  }

  function openTableMenu(e: MouseEvent, connectionId: string, database: string, table: string): void {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open Table', icon: <IconTable size={14} />, onClick: () => openTableTab({ connectionId, database, table }) },
        {
          label: 'New Query',
          icon: <IconFileCode size={14} />,
          onClick: () => openQueryTab({ connectionId, database, title: table, sql: `SELECT * FROM ${table} LIMIT 100;` }),
        },
        { label: 'sep', separator: true },
        { label: 'Copy Name', icon: <IconCopy size={14} />, onClick: () => void navigator.clipboard.writeText(table) },
      ],
    })
  }

  function openDatabaseMenu(e: MouseEvent, connectionId: string, type: DatabaseType, database: string): void {
    e.preventDefault()
    if (type !== 'postgresql' && type !== 'mysql') return
    const databaseType: BackupDatabaseType = type
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Backup All Tables…', icon: <IconBolt size={14} />, onClick: () => openBackup({ connectionId, databaseType, database, allTables: true }) },
        { label: 'sep', separator: true },
        { label: 'Backup database', icon: <IconDownload size={14} />, onClick: () => openBackup({ connectionId, databaseType, database }) },
        { label: 'Restore database', icon: <IconUpload size={14} />, onClick: () => openRestore({ connectionId, databaseType, database }) },
      ],
    })
  }

  async function commitNewFolder(name: string): Promise<void> {
    const trimmed = name.trim().slice(0, 64)
    const parentId = creating?.parentId ?? null
    setCreating(null)
    if (trimmed) await createFolder(trimmed, 'default', parentId)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function renderNode(node: SidebarNode, depth: number): ReactNode {
    if (node.type === 'folder') {
      const folder = node.data
      return (
        <FolderItem
          key={folder.id}
          folder={folder}
          depth={folderDepth(folder)}
          connectionCount={directConnCount(folder.id)}
          renaming={renamingId === folder.id}
          drop={dropTarget?.folderId === folder.id ? (dropTarget.valid ? 'valid' : 'invalid') : null}
          shake={shakeId === folder.id}
          draggable={depth === 0}
          onToggle={() => void updateFolder(folder.id, { collapsed: !folder.collapsed })}
          onContextMenu={(e) => openFolderMenu(e, folder)}
          onStartRename={() => setRenamingId(folder.id)}
          onRenameCommit={(name) => {
            void updateFolder(folder.id, { name })
            setRenamingId(null)
          }}
          onRenameCancel={() => setRenamingId(null)}
          onDragStart={depth === 0 ? (e) => startDrag(e, 'folder', folder.id) : undefined}
          onDragOver={(e) => onFolderDragOver(e, folder)}
          onDragLeave={() => setDropTarget((p) => (p?.folderId === folder.id ? null : p))}
          onDrop={(e) => onFolderDrop(e, folder)}
          onDragEnd={endDrag}
        >
          {node.children.map((child) => renderNode(child, depth + 1))}
          {creating?.parentId === folder.id ? <NewFolderInput depth={1} onCommit={commitNewFolder} /> : null}
        </FolderItem>
      )
    }
    return (
      <div
        key={node.data.config.id}
        draggable
        onDragStart={(e) => startDrag(e, 'connection', node.data.config.id)}
        onDragEnd={endDrag}
        className={dragRef.current?.id === node.data.config.id ? styles.dragging : undefined}
      >
        <ConnectionItem
          connection={node.data}
          onConnectionContextMenu={openConnectionMenu}
          onTableContextMenu={(e, database, table) => openTableMenu(e, node.data.config.id, database, table)}
          onDatabaseContextMenu={(e, database) => openDatabaseMenu(e, node.data.config.id, node.data.config.type, database)}
        />
      </div>
    )
  }

  // Root insertion drop zone between/around root nodes.
  const rootZone = (index: number): ReactNode => (
    <div
      key={`zone-${index}`}
      className={`${styles.rootZone} ${rootInsert === index ? styles.rootZoneActive : ''}`}
      onDragOver={(e) => {
        if (!dragRef.current) return
        e.preventDefault()
        setDropTarget(null)
        setRootInsert(index)
      }}
      onDragLeave={() => setRootInsert((p) => (p === index ? null : p))}
      onDrop={() => onRootDrop(index)}
    />
  )

  return (
    <div className={styles.tree}>
      <div className={styles.header}>
        <span className={styles.title}>Connections</span>
        <span className={styles.headerActions}>
          <IconButton label="New folder" onClick={() => setCreating({ parentId: null })}>
            <IconFolderPlus size={14} />
          </IconButton>
          <IconButton label="New connection" onClick={() => openConnectionForm()}>
            <IconPlus size={14} />
          </IconButton>
        </span>
      </div>

      <div className={styles.body} ref={bodyRef} onKeyDown={onTreeKeyDown}>
        {connections.length === 0 && folders.length === 0 && !creating ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No connections yet.</p>
            <button type="button" className={styles.emptyAction} onClick={() => openConnectionForm()}>
              <IconPlus size={14} />
              Add a connection
            </button>
          </div>
        ) : (
          <>
            {creating?.parentId === null ? <NewFolderInput depth={0} onCommit={commitNewFolder} /> : null}
            {tree.map((node, i) => (
              <div key={node.type === 'folder' ? node.data.id : node.data.config.id}>
                {rootZone(i)}
                {renderNode(node, 0)}
              </div>
            ))}
            {rootZone(tree.length)}
          </>
        )}
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}

      {deleteTarget ? (
        <Modal
          title="Delete folder"
          size="sm"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteFolder(deleteTarget.id)
                  setDeleteTarget(null)
                }}
              >
                Delete Folder
              </Button>
            </>
          }
        >
          <p>
            Delete folder '{deleteTarget.name}'? The {directConnCount(deleteTarget.id)} connection
            {directConnCount(deleteTarget.id) === 1 ? '' : 's'} inside will be moved up and kept. This
            cannot be undone.
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

function NewFolderInput({ depth, onCommit }: { depth: 0 | 1; onCommit: (name: string) => void }) {
  return (
    <div className={styles.newFolder} style={{ paddingLeft: depth === 1 ? 24 : 8 }}>
      <IconFolder size={14} className={styles.newFolderIcon} />
      <input
        className={styles.newFolderInput}
        placeholder="Folder name"
        maxLength={64}
        autoFocus
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(e.currentTarget.value)
          else if (e.key === 'Escape') onCommit('')
        }}
      />
    </div>
  )
}
