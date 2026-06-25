import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import type { QueryColumn } from '@/types/query'
import styles from './DataGrid.module.css'

const ROW_HEIGHT = 26
const OVERSCAN = 6

type Row = Record<string, unknown>

interface DataGridProps {
  columns: QueryColumn[]
  rows: Row[]
  rowCount?: number
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  /** Enable double-click inline editing (Table Viewer Data tab). */
  editable?: boolean
  /** Called after an edited cell loses focus / Enter, with the new text value. */
  onEditCommit?: (row: Row, column: string, value: string) => void
  /** Bare table name, for "Copy row as SQL INSERT". */
  tableName?: string
}

interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return `'${cellText(value).replace(/'/g, "''")}'`
}

export function DataGrid({
  columns,
  rows,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  editable = false,
  onEditCommit,
  tableName,
}: DataGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(320)
  const [sort, setSort] = useState<SortState | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ index: number; column: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewport(el.clientHeight))
    observer.observe(el)
    setViewport(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  // Infinite scroll: load more when the bottom sentinel is visible.
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = containerRef.current
    if (!sentinel || !root || !onLoadMore || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) onLoadMore()
      },
      { root },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, hasMore, isLoadingMore, rows.length])

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const copy = [...rows]
    copy.sort((ra, rb) => {
      const r = compare(ra[sort.column], rb[sort.column])
      return sort.dir === 'asc' ? r : -r
    })
    return copy
  }, [rows, sort])

  const total = sortedRows.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(total, start + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2)
  const visible = sortedRows.slice(start, end)

  function toggleSort(column: string): void {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
        : { column, dir: 'asc' },
    )
  }

  function cellMenu(e: MouseEvent, row: Row, value: unknown): void {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      { label: 'Copy value', onClick: () => void navigator.clipboard.writeText(cellText(value)) },
      {
        label: 'Copy row as JSON',
        onClick: () => void navigator.clipboard.writeText(JSON.stringify(row, null, 2)),
      },
    ]
    if (tableName) {
      items.push({
        label: 'Copy row as SQL INSERT',
        onClick: () => {
          const cols = columns.map((c) => c.name).join(', ')
          const vals = columns.map((c) => sqlLiteral(row[c.name])).join(', ')
          void navigator.clipboard.writeText(`INSERT INTO ${tableName} (${cols}) VALUES (${vals});`)
        },
      })
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function commitEdit(column: string, row: Row, input: HTMLInputElement): void {
    const next = input.value
    setEditing(null)
    if (next !== cellText(row[column])) onEditCommit?.(row, column, next)
  }

  function onEditKey(e: KeyboardEvent<HTMLInputElement>, column: string, row: Row): void {
    if (e.key === 'Enter') commitEdit(column, row, e.currentTarget)
    else if (e.key === 'Escape') setEditing(null)
  }

  if (columns.length === 0) {
    return <div className={styles.empty}>Statement executed (no result set).</div>
  }

  return (
    <div
      className={styles.scroll}
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.name} className={styles.th} onClick={() => toggleSort(col.name)}>
                <span className={styles.thLabel}>{col.name}</span>
                <span className={styles.type}>{col.dataType}</span>
                {sort?.column === col.name ? (
                  sort.dir === 'asc' ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 ? <tr style={{ height: start * ROW_HEIGHT }} aria-hidden="true" /> : null}
          {visible.map((row, i) => {
            const index = start + i
            return (
              <tr
                key={index}
                className={index === selected ? styles.selected : undefined}
                onClick={() => setSelected(index)}
              >
                {columns.map((col) => {
                  const value = row[col.name]
                  const isNull = value === null || value === undefined
                  const isEditing = editing?.index === index && editing.column === col.name
                  return (
                    <td
                      key={col.name}
                      className={`${styles.td} ${isNull && !isEditing ? styles.null : ''}`}
                      onContextMenu={(e) => cellMenu(e, row, value)}
                      onDoubleClick={() => {
                        if (editable) setEditing({ index, column: col.name })
                      }}
                    >
                      {isEditing ? (
                        <input
                          className={styles.editInput}
                          defaultValue={cellText(value)}
                          autoFocus
                          onBlur={(e) => commitEdit(col.name, row, e.currentTarget)}
                          onKeyDown={(e) => onEditKey(e, col.name, row)}
                        />
                      ) : isNull ? (
                        'null'
                      ) : (
                        cellText(value)
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {end < total ? (
            <tr style={{ height: (total - end) * ROW_HEIGHT }} aria-hidden="true" />
          ) : null}
          {isLoadingMore
            ? [0, 1, 2].map((s) => (
                <tr key={`skel-${s}`} className={styles.skelRow}>
                  {columns.map((c) => (
                    <td key={c.name} className={styles.td}>
                      <span className={styles.skel} />
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
      {hasMore ? <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" /> : null}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  )
}
