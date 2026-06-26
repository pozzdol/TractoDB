import type { DragEvent, MouseEvent, ReactNode } from 'react'
import { IconChevronDown, IconChevronRight, IconDots, IconFolderFilled } from '@tabler/icons-react'
import type { ConnectionFolder, FolderColor } from '@/types/connection'
import styles from './FolderItem.module.css'

export const FOLDER_COLORS: Record<FolderColor, string> = {
  default: 'var(--color-text-secondary)',
  blue: '#185FA5',
  green: '#28C840',
  orange: '#FFBD2E',
  red: '#E24B4A',
  purple: '#8B5CF6',
  pink: '#EC4899',
}

export const FOLDER_COLOR_ORDER: FolderColor[] = [
  'default',
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'pink',
]

interface FolderItemProps {
  folder: ConnectionFolder
  depth: 0 | 1
  connectionCount: number
  renaming: boolean
  drop?: 'valid' | 'invalid' | null
  shake?: boolean
  draggable?: boolean
  onToggle: () => void
  onContextMenu: (e: MouseEvent) => void
  onStartRename: () => void
  onRenameCommit: (name: string) => void
  onRenameCancel: () => void
  onDragStart?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragLeave?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  onDragEnd?: (e: DragEvent) => void
  children: ReactNode
}

export function FolderItem({
  folder,
  depth,
  connectionCount,
  renaming,
  drop,
  shake,
  draggable,
  onToggle,
  onContextMenu,
  onStartRename,
  onRenameCommit,
  onRenameCancel,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  children,
}: FolderItemProps) {
  const rowClass = [
    styles.row,
    drop === 'valid' ? styles.dropValid : '',
    drop === 'invalid' ? styles.dropInvalid : '',
    shake ? styles.shake : '',
  ]
    .filter(Boolean)
    .join(' ')

  function commit(input: HTMLInputElement): void {
    const name = input.value.trim().slice(0, 64)
    if (name && name !== folder.name) onRenameCommit(name)
    else onRenameCancel()
  }

  return (
    <div role="group">
      <div
        className={rowClass}
        style={{ paddingLeft: depth === 1 ? 24 : 8 }}
        role="treeitem"
        aria-expanded={!folder.collapsed}
        tabIndex={0}
        draggable={draggable}
        onClick={() => !renaming && onToggle()}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <span className={styles.chevron}>
          {folder.collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
        </span>
        <span className={styles.icon} style={{ color: FOLDER_COLORS[folder.color] }}>
          <IconFolderFilled size={14} />
        </span>
        {renaming ? (
          <input
            className={styles.renameInput}
            defaultValue={folder.name}
            maxLength={64}
            placeholder="Folder name"
            autoFocus
            ref={(el) => el?.select()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commit(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(e.currentTarget)
              else if (e.key === 'Escape') onRenameCancel()
            }}
          />
        ) : (
          <span className={styles.name} onDoubleClick={onStartRename}>
            {folder.name}
          </span>
        )}
        <span className={styles.meta}>
          {folder.collapsed && connectionCount > 0 ? (
            <span className={styles.badge}>{connectionCount}</span>
          ) : null}
          <button
            type="button"
            className={styles.dots}
            aria-label="Folder menu"
            onClick={(e) => {
              e.stopPropagation()
              onContextMenu(e)
            }}
          >
            <IconDots size={14} />
          </button>
        </span>
      </div>
      <div className={`${styles.children} ${folder.collapsed ? styles.collapsed : ''}`}>
        {children}
      </div>
    </div>
  )
}
