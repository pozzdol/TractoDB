import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import type { QueryResult } from '@shared/ipc'
import styles from './DataGrid.module.css'

const ROW_HEIGHT = 26
const OVERSCAN = 6

interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1 // nulls last
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DataGrid({ result }: { result: QueryResult }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(320)
  const [sort, setSort] = useState<SortState | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewport(el.clientHeight))
    observer.observe(el)
    setViewport(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  const rows = useMemo(() => {
    if (!sort) return result.rows
    const sorted = [...result.rows]
    sorted.sort((ra, rb) => {
      const r = compare(ra[sort.column], rb[sort.column])
      return sort.dir === 'asc' ? r : -r
    })
    return sorted
  }, [result.rows, sort])

  const total = rows.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(total, start + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2)
  const visible = rows.slice(start, end)

  function toggleSort(column: string): void {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
        : { column, dir: 'asc' },
    )
  }

  function onCellContextMenu(e: MouseEvent, value: unknown): void {
    e.preventDefault()
    const text = cellText(value)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Copy value', onClick: () => void navigator.clipboard.writeText(text) }],
    })
  }

  if (result.columns.length === 0) {
    return (
      <div className={styles.empty}>
        {result.rowCount} row{result.rowCount === 1 ? '' : 's'} affected.
      </div>
    )
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
            {result.columns.map((col) => (
              <th key={col.name} className={styles.th} onClick={() => toggleSort(col.name)}>
                <span className={styles.thLabel}>{col.name}</span>
                <span className={styles.type}>{col.dataType}</span>
                {sort?.column === col.name ? (
                  sort.dir === 'asc' ? (
                    <IconChevronUp size={11} />
                  ) : (
                    <IconChevronDown size={11} />
                  )
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
                {result.columns.map((col) => {
                  const value = row[col.name]
                  const isNull = value === null || value === undefined
                  return (
                    <td
                      key={col.name}
                      className={`${styles.td} ${isNull ? styles.null : ''}`}
                      onContextMenu={(e) => onCellContextMenu(e, value)}
                    >
                      {isNull ? 'null' : cellText(value)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {end < total ? (
            <tr style={{ height: (total - end) * ROW_HEIGHT }} aria-hidden="true" />
          ) : null}
        </tbody>
      </table>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  )
}
