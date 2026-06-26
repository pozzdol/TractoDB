import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  IconArrowBackUp,
  IconBaselineDensityLarge,
  IconBaselineDensityMedium,
  IconBaselineDensitySmall,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
  IconGripHorizontal,
} from '@tabler/icons-react'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { Button } from '@/components/ui/Button'
import { ROW_HEIGHT_PRESETS, useGridLayout } from '@/hooks/useGridLayout'
import type { QueryColumn } from '@/types/query'
import { FilterPopover } from './FilterPopover'
import styles from './DataGrid.module.css'

const OVERSCAN = 6
const AUTOFIT_SAMPLE = 200 // rows measured for double-click auto-fit

type Row = Record<string, unknown>

interface DataGridProps {
  columns: QueryColumn[]
  rows: Row[]
  rowCount?: number
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  /** Layout identity: "<connectionId>/<database>/<table>" (session-only). */
  gridKey?: string
  /** Enable double-click inline editing (Table Viewer Data tab). */
  editable?: boolean
  /** Called after an edited cell loses focus / Enter, with the new text value. */
  onEditCommit?: (row: Row, column: string, value: string) => void
  /** Bare table name, for "Copy row as SQL INSERT". */
  tableName?: string
  /** Selection changes, resolved to row objects (sort-independent). */
  onSelectionChange?: (rows: Row[], cells: { row: Row; colKey: string }[]) => void
  /** Extra controls injected at the left of the grid toolbar (row operations). */
  toolbarExtra?: ReactNode
  /** Ctrl+C / Ctrl+V within the grid. */
  onCopy?: () => void
  onPaste?: () => void
  /** Per-column filters (Feature 5): active filter values keyed by column. */
  columnFilters?: Map<string, unknown[]>
  onLoadDistinct?: (colKey: string) => Promise<unknown[]>
  onApplyColumnFilter?: (colKey: string, values: unknown[]) => void
  onClearColumnFilter?: (colKey: string) => void
}

// Per-row marker (Table Viewer staged changes): read from row['__state'].
type RowMarker = 'new' | 'modified' | 'deleted'

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

// Cached canvas for measuring text width (auto-fit).
let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

export function DataGrid({
  columns,
  rows,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  gridKey = '',
  editable = false,
  onEditCommit,
  tableName,
  onSelectionChange,
  toolbarExtra,
  onCopy,
  onPaste,
  columnFilters,
  onLoadDistinct,
  onApplyColumnFilter,
  onClearColumnFilter,
}: DataGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(320)
  const [sort, setSort] = useState<SortState | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [lastClickedRow, setLastClickedRow] = useState<number | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()) // "rowIndex:colKey"
  const [lastClickedCell, setLastClickedCell] = useState<string | null>(null)
  const [selectedCol, setSelectedCol] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ index: number; column: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [filterPopover, setFilterPopover] = useState<{ col: string; x: number; y: number } | null>(null)

  const ROW_NUM_WIDTH = 40 // fixed row-number column, not resizable/reorderable

  // ── Row selection: plain / Ctrl(toggle) / Shift(range, merge) ───────────────
  function onRowNumClick(e: MouseEvent, index: number): void {
    setSelectedCol(null)
    if (e.shiftKey && lastClickedRow !== null) {
      const lo = Math.min(lastClickedRow, index)
      const hi = Math.max(lastClickedRow, index)
      setSelectedRows((prev) => {
        const next = new Set(prev)
        for (let i = lo; i <= hi; i++) next.add(i)
        return next
      })
      // Shift+click does not move the anchor.
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedRows((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
      setLastClickedRow(index)
    } else {
      setSelectedRows(new Set([index]))
      setLastClickedRow(index)
    }
  }

  function selectCol(key: string): void {
    setSelectedCol((prev) => (prev === key ? null : key))
  }

  // ── Cell selection: independent of row selection ────────────────────────────
  const colIndex = (key: string): number => displayColumns.findIndex((c) => c.col.name === key)
  function onCellClick(e: MouseEvent, index: number, colKey: string): void {
    const key = `${index}:${colKey}`
    if (e.shiftKey && lastClickedCell) {
      const [lr, lk] = lastClickedCell.split(':')
      const r0 = Number(lr)
      const c0 = colIndex(lk ?? '')
      const c1 = colIndex(colKey)
      if (c0 < 0 || c1 < 0) return
      const [rLo, rHi] = [Math.min(r0, index), Math.max(r0, index)]
      const [cLo, cHi] = [Math.min(c0, c1), Math.max(c0, c1)]
      setSelectedCells(() => {
        const next = new Set<string>()
        for (let r = rLo; r <= rHi; r++)
          for (let c = cLo; c <= cHi; c++) next.add(`${r}:${displayColumns[c]?.col.name}`)
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      setLastClickedCell(key)
    } else {
      setSelectedCells(new Set([key]))
      setLastClickedCell(key)
    }
  }

  // Row background priority: selected > hover > zebra stripe.
  function rowBackground(index: number): string {
    if (selectedRows.has(index)) return 'var(--grid-row-selected)'
    if (hoveredRow === index) return 'var(--grid-row-hover)'
    return index % 2 === 1 ? 'var(--grid-row-even)' : 'var(--grid-row-odd)'
  }

  function onGridKeyDown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'a') {
      e.preventDefault()
      setSelectedRows(new Set(sortedRows.map((_, i) => i)))
    } else if (k === 'c' && onCopy) {
      e.preventDefault()
      onCopy()
    } else if (k === 'v' && onPaste) {
      e.preventDefault()
      onPaste()
    }
  }

  const columnNames = useMemo(() => columns.map((c) => c.name), [columns])
  const { layout, setColumnWidth, reorderColumn, setRowHeight, resetLayout } = useGridLayout(
    gridKey,
    columnNames,
  )
  const rowHeight = layout.rowHeight

  // Columns in display order, joined with their server metadata + width.
  const displayColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.name, c]))
    return [...layout.columns]
      .sort((a, b) => a.order - b.order)
      .map((cl) => ({ col: byKey.get(cl.key), width: cl.width }))
      .filter((x): x is { col: QueryColumn; width: number } => x.col !== undefined)
  }, [columns, layout.columns])

  const tableWidth = ROW_NUM_WIDTH + displayColumns.reduce((sum, c) => sum + c.width, 0)

  // Drag-to-resize / drag-to-reorder bookkeeping (refs avoid re-render churn).
  const resize = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const suppressDrag = useRef(false)
  const dragFrom = useRef<number | null>(null)
  const rowResize = useRef<{ startY: number; startHeight: number } | null>(null)

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
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const end = Math.min(total, start + Math.ceil(viewport / rowHeight) + OVERSCAN * 2)
  const visible = sortedRows.slice(start, end)

  // Report selection as row objects (carry __rowId), so consumers are sort-independent.
  useEffect(() => {
    if (!onSelectionChange) return
    const rowsSel = [...selectedRows]
      .map((i) => sortedRows[i])
      .filter((r): r is Row => r !== undefined)
    const cellsSel = [...selectedCells]
      .map((key) => {
        const sep = key.indexOf(':')
        const row = sortedRows[Number(key.slice(0, sep))]
        return row ? { row, colKey: key.slice(sep + 1) } : null
      })
      .filter((c): c is { row: Row; colKey: string } => c !== null)
    onSelectionChange(rowsSel, cellsSel)
  }, [selectedRows, selectedCells, sortedRows, onSelectionChange])

  function toggleSort(column: string): void {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
        : { column, dir: 'asc' },
    )
  }

  // ── Column resize ──────────────────────────────────────────────────────────
  function startResize(e: MouseEvent, key: string, width: number): void {
    e.preventDefault()
    e.stopPropagation()
    suppressDrag.current = true
    resize.current = { key, startX: e.clientX, startWidth: width }
    const onMove = (ev: globalThis.MouseEvent): void => {
      if (!resize.current) return
      setColumnWidth(resize.current.key, resize.current.startWidth + (ev.clientX - resize.current.startX))
    }
    const onUp = (): void => {
      resize.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setTimeout(() => (suppressDrag.current = false), 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function autoFit(key: string): void {
    const headerFont = '600 11px monospace'
    const cellFont = '11px monospace'
    let max = textWidth(key, headerFont)
    for (let i = 0; i < Math.min(rows.length, AUTOFIT_SAMPLE); i++) {
      const w = textWidth(cellText(rows[i]?.[key]), cellFont)
      if (w > max) max = w
    }
    setColumnWidth(key, max + 16)
  }

  // ── Column reorder (native DnD) ──────────────────────────────────────────────
  // Note: using native drag image (not custom ghost element) and
  // box-shadow drop indicator (not separate line element) — both
  // confirmed working in audit, accepted as final implementation.
  function onHeaderDragStart(e: DragEvent, index: number): void {
    if (suppressDrag.current) {
      e.preventDefault()
      return
    }
    dragFrom.current = index
    e.dataTransfer.effectAllowed = 'move'
  }
  function onHeaderDrop(index: number): void {
    if (dragFrom.current !== null && dragFrom.current !== index) {
      reorderColumn(dragFrom.current, index)
    }
    dragFrom.current = null
    setDragOver(null)
  }

  // ── Freeform row height drag ─────────────────────────────────────────────────
  function startRowResize(e: MouseEvent): void {
    e.preventDefault()
    rowResize.current = { startY: e.clientY, startHeight: rowHeight }
    const onMove = (ev: globalThis.MouseEvent): void => {
      if (!rowResize.current) return
      setRowHeight(rowResize.current.startHeight + (ev.clientY - rowResize.current.startY))
    }
    const onUp = (): void => {
      rowResize.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
          const cols = displayColumns.map((c) => c.col.name).join(', ')
          const vals = displayColumns.map((c) => sqlLiteral(row[c.col.name])).join(', ')
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

  const densityButton = (label: string, height: number, icon: ReactNode): ReactNode => (
    <Button
      variant={rowHeight === height ? 'primary' : 'ghost'}
      className={styles.densityBtn}
      title={label}
      aria-label={label}
      aria-pressed={rowHeight === height}
      onClick={() => setRowHeight(height)}
    >
      {icon}
    </Button>
  )

  return (
    <div className={styles.gridWrap}>
      <div className={styles.toolbar}>
        {toolbarExtra}
        <span
          className={styles.rowGrip}
          title="Drag to resize row height"
          onMouseDown={startRowResize}
        >
          <IconGripHorizontal size={13} />
        </span>
        {densityButton('Compact', ROW_HEIGHT_PRESETS.compact, <IconBaselineDensitySmall size={14} />)}
        {densityButton('Normal', ROW_HEIGHT_PRESETS.normal, <IconBaselineDensityMedium size={14} />)}
        {densityButton('Relaxed', ROW_HEIGHT_PRESETS.relaxed, <IconBaselineDensityLarge size={14} />)}
        <Button
          variant="ghost"
          className={styles.densityBtn}
          title="Reset column widths and order"
          aria-label="Reset layout"
          onClick={resetLayout}
        >
          <IconArrowBackUp size={14} />
        </Button>
      </div>

      <div
        className={styles.scroll}
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table className={styles.table} style={{ width: tableWidth }}>
          <colgroup>
            <col style={{ width: ROW_NUM_WIDTH }} />
            {displayColumns.map(({ col, width }) => (
              <col key={col.name} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={`${styles.th} ${styles.rowNumHead}`}>#</th>
              {displayColumns.map(({ col, width }, index) => (
                <th
                  key={col.name}
                  className={`${styles.th} ${dragOver === index ? styles.dropTarget : ''} ${selectedCol === col.name ? styles.colActive : ''}`}
                  draggable
                  onDragStart={(e) => onHeaderDragStart(e, index)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragFrom.current !== null) setDragOver(index)
                  }}
                  onDrop={() => onHeaderDrop(index)}
                  onDragEnd={() => {
                    dragFrom.current = null
                    setDragOver(null)
                  }}
                  onClick={() => {
                    toggleSort(col.name)
                    selectCol(col.name)
                  }}
                >
                  <span className={styles.thLabel}>{col.name}</span>
                  <span className={styles.type}>{col.dataType}</span>
                  {sort?.column === col.name ? (
                    sort.dir === 'asc' ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />
                  ) : null}
                  {onLoadDistinct ? (
                    <button
                      type="button"
                      className={`${styles.filterBtn} ${columnFilters?.has(col.name) ? styles.filterActive : ''}`}
                      aria-label={`Filter ${col.name}`}
                      title={`Filter ${col.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        const r = e.currentTarget.closest('th')?.getBoundingClientRect()
                        if (r) setFilterPopover({ col: col.name, x: r.left, y: r.bottom })
                      }}
                    >
                      <IconFilter size={11} />
                      {columnFilters?.has(col.name) ? <span className={styles.filterDot} /> : null}
                    </button>
                  ) : null}
                  <span
                    className={styles.resizer}
                    onMouseDown={(e) => startResize(e, col.name, width)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      autoFit(col.name)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-hidden="true"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 ? <tr style={{ height: start * rowHeight }} aria-hidden="true" /> : null}
            {visible.map((row, i) => {
              const index = start + i
              const rowSelected = selectedRows.has(index)
              const marker = row['__state'] as RowMarker | undefined
              const markClass =
                marker === 'new'
                  ? styles.markNew
                  : marker === 'modified'
                    ? styles.markModified
                    : marker === 'deleted'
                      ? styles.markDeleted
                      : ''
              return (
                <tr
                  key={index}
                  className={marker === 'deleted' ? styles.rowDeleted : undefined}
                  style={{ height: rowHeight, background: rowBackground(index) }}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow((prev) => (prev === index ? null : prev))}
                >
                  <td
                    className={`${styles.rowNum} ${markClass} ${rowSelected ? styles.rowNumActive : ''}`}
                    onClick={(e) => onRowNumClick(e, index)}
                  >
                    {index + 1}
                  </td>
                  {displayColumns.map(({ col }) => {
                    const value = row[col.name]
                    const isNull = value === null || value === undefined
                    const isEditing = editing?.index === index && editing.column === col.name
                    const cellSelected = selectedCells.has(`${index}:${col.name}`)
                    const cellStyle = cellSelected
                      ? {
                          background: 'var(--grid-row-selected)',
                          outline: '2px solid var(--color-accent)',
                          outlineOffset: '-2px',
                        }
                      : selectedCol === col.name
                        ? { background: 'var(--grid-col-highlight)' }
                        : undefined
                    return (
                      <td
                        key={col.name}
                        className={`${styles.td} ${isNull && !isEditing ? styles.null : ''}`}
                        style={cellStyle}
                        onClick={(e) => onCellClick(e, index, col.name)}
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
                          // Staged new rows show unset cells as empty (spec 2B), not "null".
                          marker === 'new' ? '' : 'null'
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
              <tr style={{ height: (total - end) * rowHeight }} aria-hidden="true" />
            ) : null}
            {isLoadingMore
              ? [0, 1, 2].map((s) => (
                  <tr key={`skel-${s}`} className={styles.skelRow} style={{ height: rowHeight }}>
                    <td className={styles.rowNum} />
                    {displayColumns.map(({ col }) => (
                      <td key={col.name} className={styles.td}>
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
      {filterPopover && onLoadDistinct ? (
        <FilterPopover
          key={filterPopover.col}
          colKey={filterPopover.col}
          width={displayColumns.find((c) => c.col.name === filterPopover.col)?.width ?? 220}
          anchor={{ x: filterPopover.x, y: filterPopover.y }}
          current={columnFilters?.get(filterPopover.col) ?? null}
          loadValues={() => onLoadDistinct(filterPopover.col)}
          onApply={(vals) => {
            onApplyColumnFilter?.(filterPopover.col, vals)
            setFilterPopover(null)
          }}
          onClear={() => {
            onClearColumnFilter?.(filterPopover.col)
            setFilterPopover(null)
          }}
          onClose={() => setFilterPopover(null)}
        />
      ) : null}
    </div>
  )
}
