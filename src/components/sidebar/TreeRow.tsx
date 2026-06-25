import {
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
} from '@tabler/icons-react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import styles from './TreeRow.module.css'

interface TreeRowProps {
  depth: number
  label: string
  icon: ReactNode
  expandable?: boolean
  expanded?: boolean
  loading?: boolean
  active?: boolean
  /** Smaller 24px / text-sm row for nested schema items (DESIGN.md). */
  compact?: boolean
  /** Render the label in danger red (e.g. production connection). */
  danger?: boolean
  meta?: ReactNode
  title?: string
  onActivate?: () => void
  onToggle?: () => void
  onContextMenu?: (e: MouseEvent) => void
}

const INDENT_BASE = 8
const INDENT_STEP = 12

export function TreeRow({
  depth,
  label,
  icon,
  expandable = false,
  expanded = false,
  loading = false,
  active = false,
  compact = false,
  danger = false,
  meta,
  title,
  onActivate,
  onToggle,
  onContextMenu,
}: TreeRowProps) {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate?.()
    } else if (e.key === 'ArrowRight' && expandable && !expanded) {
      e.preventDefault()
      onToggle?.()
    } else if (e.key === 'ArrowLeft' && expandable && expanded) {
      e.preventDefault()
      onToggle?.()
    }
  }

  const className = [
    styles.row,
    compact ? styles.compact : '',
    active ? styles.active : '',
    danger ? styles.danger : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ paddingLeft: INDENT_BASE + depth * INDENT_STEP }}
      role="treeitem"
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={active || undefined}
      tabIndex={0}
      title={title ?? label}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <span className={styles.chevron}>
        {loading ? (
          <IconLoader2 size={12} className={styles.spin} />
        ) : expandable ? (
          <button
            type="button"
            className={styles.chevronButton}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
          >
            {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </button>
        ) : null}
      </span>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </div>
  )
}
