import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconClipboard,
  IconClipboardCheck,
  IconCopy,
  IconRowInsertBottom,
  IconTrash,
} from '@tabler/icons-react'
import { DataGrid } from '@/components/grid/DataGrid'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useTabStore } from '@/store/tabStore'
import { qualifiedName, quoteIdent } from '@/lib/sqlIdent'
import type { DatabaseType } from '@/types/connection'
import type { QueryColumn } from '@/types/query'
import type { TableTabProps } from './TableViewer'
import { ColumnSqlBar, buildClauseQuery, type Clause } from './ColumnSqlBar'
import styles from './TableData.module.css'

type Row = Record<string, unknown>
type RowState = 'new' | 'modified' | 'deleted' | 'unchanged'

interface EditRow {
  rowId: string
  original: Row | null // null for new rows
  current: Row
  state: RowState
}

const PAGE = 100
let tmpCounter = 0
function tmpId(): string {
  tmpCounter += 1
  return `new:${tmpCounter}`
}

// ─── SQL generation ───────────────────────────────────────────────────────────
function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function valEq(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true
  return String(a) === String(b)
}

function buildStatements(
  editRows: EditRow[],
  columns: QueryColumn[],
  pkColumn: string | null,
  qualified: string,
  dbType: DatabaseType,
): string[] {
  const qid = (c: string): string => quoteIdent(dbType, c)
  const names = columns.map((c) => c.name)
  const stmts: string[] = []
  // a. INSERTs
  for (const er of editRows) {
    if (er.state !== 'new') continue
    const cols = names.filter((c) => er.current[c] !== undefined)
    if (cols.length === 0) continue
    stmts.push(
      `INSERT INTO ${qualified} (${cols.map(qid).join(', ')}) VALUES (${cols
        .map((c) => literal(er.current[c]))
        .join(', ')});`,
    )
  }
  // b. UPDATEs (only changed columns)
  if (pkColumn) {
    for (const er of editRows) {
      if (er.state !== 'modified' || !er.original) continue
      const changed = names.filter((c) => !valEq(er.current[c], er.original?.[c]))
      if (changed.length === 0) continue
      const set = changed.map((c) => `${qid(c)} = ${literal(er.current[c])}`).join(', ')
      stmts.push(`UPDATE ${qualified} SET ${set} WHERE ${qid(pkColumn)} = ${literal(er.original[pkColumn])};`)
    }
    // c. DELETEs
    for (const er of editRows) {
      if (er.state !== 'deleted' || !er.original) continue
      stmts.push(`DELETE FROM ${qualified} WHERE ${qid(pkColumn)} = ${literal(er.original[pkColumn])};`)
    }
  }
  return stmts
}

function countByState(editRows: EditRow[]): { modified: number; new: number; deleted: number } {
  return {
    modified: editRows.filter((r) => r.state === 'modified').length,
    new: editRows.filter((r) => r.state === 'new').length,
    deleted: editRows.filter((r) => r.state === 'deleted').length,
  }
}

function dirtySummary(c: { modified: number; new: number; deleted: number }): string {
  const parts: string[] = []
  if (c.new) parts.push(`${c.new} new`)
  if (c.modified) parts.push(`${c.modified} modified`)
  if (c.deleted) parts.push(`${c.deleted} deleted`)
  return parts.join(', ')
}

export function TableData({ tabId, connectionId, database, schema, table, dbType, readOnly }: TableTabProps) {
  const qualified = qualifiedName(dbType, schema, table)
  const setTabDirty = useTabStore((s) => s.setTabDirty)

  const [columns, setColumns] = useState<QueryColumn[]>([])
  const [editRows, setEditRows] = useState<EditRow[]>([])
  const [pkColumn, setPkColumn] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection mirrored from the grid (row objects carry __rowId).
  const [selRows, setSelRows] = useState<Row[]>([])
  const [selCells, setSelCells] = useState<{ row: Row; colKey: string }[]>([])

  // Dialogs
  const [review, setReview] = useState<string[] | null>(null) // statements being reviewed
  const [execError, setExecError] = useState<{ stmt: string; message: string } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Column SQL bar (Feature 4)
  const [clause, setClause] = useState<Clause>('WHERE')
  const [filterText, setFilterText] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [pendingFilter, setPendingFilter] = useState<string | null>(null)
  const appliedQueryRef = useRef<string>(`SELECT * FROM ${qualified}`)
  const builtQuery = buildClauseQuery(clause, qualified, filterText)
  const columnNames = useMemo(() => columns.map((c) => c.name), [columns])

  const editable = !readOnly && pkColumn !== null
  const counts = useMemo(() => countByState(editRows), [editRows])
  const isDirty = counts.new + counts.modified + counts.deleted > 0

  function rowIdOf(dbRow: Row, idx: number): string {
    return pkColumn != null && dbRow[pkColumn] != null ? `pk:${String(dbRow[pkColumn])}` : `idx:${idx}`
  }

  // Run a page of `query`; returns the outcome so callers choose where to show errors.
  const runPage = useCallback(
    async (query: string, offset: number): Promise<{ ok: boolean; error?: string }> => {
      const res = await api().query.execute(connectionId, query, database, offset, PAGE)
      if (!res.success) return { ok: false, error: res.error }
      const data = res.data
      setColumns(data.columns)
      setTotalCount(data.totalCount)
      setHasMore(Boolean(data.hasMore))
      setEditRows((prev) => {
        const fresh = data.rows.map(
          (r, i): EditRow => ({ rowId: rowIdOf(r, offset + i), original: r, current: r, state: 'unchanged' }),
        )
        return offset === 0 ? fresh : [...prev, ...fresh]
      })
      return { ok: true }
    },
    // rowIdOf depends on pkColumn; intentionally re-create when pk known
    [connectionId, database, pkColumn],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setEditRows([])
    const cols = await api().schema.listColumns(connectionId, database, schema ? `${schema}.${table}` : table)
    if (cols.success) setPkColumn(cols.data.find((c) => c.isPrimaryKey)?.name ?? null)
    const r = await runPage(appliedQueryRef.current, 0)
    if (!r.ok) setError(r.error ?? 'Failed to load.')
    setLoading(false)
  }, [connectionId, database, schema, table, runPage])

  useEffect(() => {
    let cancelled = false
    appliedQueryRef.current = `SELECT * FROM ${qualified}`
    void (async () => {
      setLoading(true)
      setError(null)
      setEditRows([])
      const cols = await api().schema.listColumns(connectionId, database, schema ? `${schema}.${table}` : table)
      if (cancelled) return
      const pk = cols.success ? (cols.data.find((c) => c.isPrimaryKey)?.name ?? null) : null
      setPkColumn(pk)
      const res = await api().query.execute(connectionId, `SELECT * FROM ${qualified}`, database, 0, PAGE)
      if (cancelled) return
      if (!res.success) {
        setError(res.error)
        setLoading(false)
        return
      }
      setColumns(res.data.columns)
      setTotalCount(res.data.totalCount)
      setHasMore(Boolean(res.data.hasMore))
      setEditRows(
        res.data.rows.map((r, i): EditRow => ({
          rowId: pk != null && r[pk] != null ? `pk:${String(r[pk])}` : `idx:${i}`,
          original: r,
          current: r,
          state: 'unchanged',
        })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table, qualified])

  // Report dirty state to the tab store (close protection); clear on unmount.
  useEffect(() => {
    setTabDirty(tabId, isDirty)
  }, [tabId, isDirty, setTabDirty])
  useEffect(() => () => setTabDirty(tabId, false), [tabId, setTabDirty])

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await runPage(appliedQueryRef.current, editRows.filter((r) => r.state !== 'new').length)
    setLoadingMore(false)
  }

  // ── Column SQL bar: apply / clear / debounced auto-apply ────────────────────
  const applyFilter = useCallback(
    async (query: string) => {
      setApplying(true)
      setFilterError(null)
      const r = await runPage(query, 0)
      if (r.ok) appliedQueryRef.current = query
      else setFilterError(r.error ?? 'Query failed.')
      setApplying(false)
    },
    [runPage],
  )

  function requestApply(query: string): void {
    if (query === appliedQueryRef.current) return
    if (isDirty) setPendingFilter(query)
    else void applyFilter(query)
  }

  function clearFilter(): void {
    setFilterText('')
    setFilterError(null)
    requestApply(`SELECT * FROM ${qualified}`)
  }

  // Auto-apply 800ms after typing stops.
  useEffect(() => {
    if (loading || builtQuery === appliedQueryRef.current) return
    const t = setTimeout(() => {
      if (isDirty) setPendingFilter(builtQuery)
      else void applyFilter(builtQuery)
    }, 800)
    return () => clearTimeout(t)
  }, [builtQuery, loading, isDirty, applyFilter])

  // ── Display rows for the grid (carry __rowId + __state) ─────────────────────
  const displayRows = useMemo(
    () => editRows.map((er) => ({ ...er.current, __rowId: er.rowId, __state: er.state })),
    [editRows],
  )
  const indexByRowId = useMemo(() => {
    const m = new Map<string, number>()
    editRows.forEach((er, i) => m.set(er.rowId, i))
    return m
  }, [editRows])

  // ── Inline edit → stage ──────────────────────────────────────────────────────
  function onEditCommit(row: Row, column: string, value: string): void {
    const rowId = row['__rowId'] as string
    setEditRows((rows) =>
      rows.map((er) => {
        if (er.rowId !== rowId || er.state === 'deleted') return er
        const current = { ...er.current, [column]: value }
        const state: RowState = er.state === 'new' ? 'new' : 'modified'
        return { ...er, current, state }
      }),
    )
  }

  // ── Row operations ─────────────────────────────────────────────────────────
  function addRow(): void {
    setEditRows((rows) => [...rows, { rowId: tmpId(), original: null, current: {}, state: 'new' }])
  }

  function duplicateRows(): void {
    const ids = new Set(selRows.map((r) => r['__rowId'] as string))
    if (ids.size === 0) return
    setEditRows((rows) => {
      const out: EditRow[] = []
      for (const er of rows) {
        out.push(er)
        if (ids.has(er.rowId)) {
          const current = { ...er.current }
          if (pkColumn) current[pkColumn] = undefined // clear PK — DB regenerates
          out.push({ rowId: tmpId(), original: null, current, state: 'new' })
        }
      }
      return out
    })
  }

  function deleteRows(): void {
    const ids = new Set(selRows.map((r) => r['__rowId'] as string))
    if (ids.size === 0) return
    setEditRows((rows) =>
      rows
        .map((er) => (ids.has(er.rowId) && er.state !== 'new' ? { ...er, state: 'deleted' as RowState } : er))
        .filter((er) => !(ids.has(er.rowId) && er.state === 'new')),
    )
  }

  // ── Copy / Paste (TSV, Excel-style) ──────────────────────────────────────────
  function handleCopy(): void {
    const names = columns.map((c) => c.name)
    let tsv = ''
    if (selCells.length > 0) {
      // bounding box over selected cells
      const rIdx = selCells.map((c) => indexByRowId.get(c.row['__rowId'] as string) ?? -1).filter((n) => n >= 0)
      const cIdx = selCells.map((c) => names.indexOf(c.colKey)).filter((n) => n >= 0)
      const rLo = Math.min(...rIdx)
      const rHi = Math.max(...rIdx)
      const cLo = Math.min(...cIdx)
      const cHi = Math.max(...cIdx)
      const lines: string[] = []
      for (let r = rLo; r <= rHi; r++) {
        const cells: string[] = []
        for (let c = cLo; c <= cHi; c++) cells.push(String(editRows[r]?.current[names[c] ?? ''] ?? ''))
        lines.push(cells.join('\t'))
      }
      tsv = lines.join('\n')
    } else if (selRows.length > 0) {
      const ids = selRows
        .map((r) => indexByRowId.get(r['__rowId'] as string) ?? -1)
        .filter((n) => n >= 0)
        .sort((a, b) => a - b)
      const lines = [names.join('\t')]
      for (const i of ids) lines.push(names.map((n) => String(editRows[i]?.current[n] ?? '')).join('\t'))
      tsv = lines.join('\n')
    } else {
      return
    }
    void navigator.clipboard.writeText(tsv)
    setToast('Copied to clipboard')
  }

  async function handlePaste(): Promise<void> {
    if (!editable) return
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return
    }
    if (!text) return
    const names = columns.map((c) => c.name)
    let grid = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'))
    if (grid.length === 0) return
    // drop a header row if it matches column names
    const first = grid[0] ?? []
    if (first.length > 0 && first.every((h) => names.some((n) => n.toLowerCase() === h.trim().toLowerCase()))) {
      grid = grid.slice(1)
    }
    if (grid.length === 0) return

    const anchor = selCells.length === 1 ? selCells[0] : null
    if (anchor) {
      const aRow = indexByRowId.get(anchor.row['__rowId'] as string) ?? 0
      const aCol = Math.max(0, names.indexOf(anchor.colKey))
      setEditRows((rows) => {
        const out = [...rows]
        grid.forEach((line, r) => {
          const target = aRow + r
          if (target < out.length) {
            const er = out[target]
            if (!er) return
            const current = { ...er.current }
            line.forEach((val, c) => {
              const col = names[aCol + c]
              if (col) current[col] = val
            })
            out[target] = { ...er, current, state: er.state === 'new' ? 'new' : 'modified' }
          } else {
            const current: Row = {}
            line.forEach((val, c) => {
              const col = names[aCol + c]
              if (col) current[col] = val
            })
            out.push({ rowId: tmpId(), original: null, current, state: 'new' })
          }
        })
        return out
      })
    } else {
      // append as new rows, mapping columns left-to-right
      setEditRows((rows) => [
        ...rows,
        ...grid.map((line): EditRow => {
          const current: Row = {}
          line.forEach((val, c) => {
            const col = names[c]
            if (col) current[col] = val
          })
          return { rowId: tmpId(), original: null, current, state: 'new' }
        }),
      ])
    }
    setToast(`Pasted ${grid.length} row${grid.length === 1 ? '' : 's'}`)
  }

  // ── Save / Cancel ────────────────────────────────────────────────────────────
  function openReview(): void {
    setExecError(null)
    setReview(buildStatements(editRows, columns, pkColumn, qualified, dbType))
  }

  async function executeAll(): Promise<void> {
    if (!review) return
    setExecError(null)
    // Best-effort transaction on the connection's single client.
    await api().query.execute(connectionId, 'BEGIN', database).catch(() => undefined)
    for (const stmt of review) {
      const res = await api().query.execute(connectionId, stmt, database)
      if (!res.success) {
        await api().query.execute(connectionId, 'ROLLBACK', database).catch(() => undefined)
        setExecError({ stmt, message: res.error })
        return // leave staged rows intact
      }
    }
    await api().query.execute(connectionId, 'COMMIT', database).catch(() => undefined)
    setReview(null)
    setToast('Changes saved')
    await reload()
  }

  function discardChanges(): void {
    setConfirmCancel(false)
    void reload()
  }

  // ── Selection mirror (stable callback) ───────────────────────────────────────
  const onSelectionChange = useCallback(
    (rows: Row[], cells: { row: Row; colKey: string }[]) => {
      setSelRows(rows)
      setSelCells(cells)
    },
    [],
  )

  if (loading) return <div className={styles.message}>Loading…</div>
  if (error) return <div className={styles.error}>{error}</div>

  const loadedCount = editRows.filter((r) => r.state !== 'new').length
  const toolbar = (
    <div className={styles.ops}>
      <Button variant="ghost" className={styles.opBtn} title="Add row" aria-label="Add row" disabled={!editable} onClick={addRow}>
        <IconRowInsertBottom size={14} /> Add
      </Button>
      <Button
        variant="ghost"
        className={styles.opBtn}
        title="Duplicate selected rows"
        aria-label="Duplicate rows"
        disabled={!editable || selRows.length === 0}
        onClick={duplicateRows}
      >
        <IconCopy size={14} /> Duplicate
      </Button>
      <Button
        variant="ghost"
        className={styles.opBtn}
        title="Delete selected rows"
        aria-label="Delete rows"
        disabled={!editable || selRows.length === 0}
        onClick={deleteRows}
      >
        <IconTrash size={14} /> Delete{selRows.length > 0 ? ` (${selRows.length})` : ''}
      </Button>
      <span className={styles.opSep} />
      <Button
        variant="ghost"
        className={styles.opBtn}
        title="Copy selection"
        aria-label="Copy"
        disabled={selRows.length === 0 && selCells.length === 0}
        onClick={handleCopy}
      >
        <IconClipboard size={14} /> Copy
      </Button>
      <Button
        variant="ghost"
        className={styles.opBtn}
        title="Paste"
        aria-label="Paste"
        disabled={!editable}
        onClick={() => void handlePaste()}
      >
        <IconClipboardCheck size={14} /> Paste
      </Button>
    </div>
  )

  return (
    <div className={styles.wrap}>
      <ColumnSqlBar
        clause={clause}
        value={filterText}
        builtQuery={builtQuery}
        columns={columnNames}
        error={filterError}
        loading={applying}
        onClauseChange={setClause}
        onChange={setFilterText}
        onApply={() => requestApply(builtQuery)}
        onClear={clearFilter}
      />
      {isDirty ? (
        <div className={styles.saveBar} role="status">
          <span className={styles.saveMsg}>
            <IconAlertTriangle size={14} />
            {counts.new + counts.modified + counts.deleted} unsaved change
            {counts.new + counts.modified + counts.deleted === 1 ? '' : 's'} ({dirtySummary(counts)})
          </span>
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={openReview}>
            Save
          </Button>
        </div>
      ) : null}

      <div className={styles.statusBar}>
        {totalCount !== undefined
          ? hasMore
            ? `Showing ${loadedCount} of ${totalCount.toLocaleString()} rows`
            : `${editRows.length.toLocaleString()} rows`
          : `${editRows.length} rows`}
        {readOnly ? <span className={styles.ro}>read-only</span> : null}
        {!readOnly && !pkColumn ? <span className={styles.ro}>no primary key — editing disabled</span> : null}
      </div>

      <DataGrid
        columns={columns}
        rows={displayRows}
        gridKey={`${connectionId}/${database}/${schema ? `${schema}.` : ''}${table}`}
        hasMore={hasMore}
        isLoadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        editable={editable}
        onEditCommit={onEditCommit}
        tableName={qualified}
        onSelectionChange={onSelectionChange}
        toolbarExtra={toolbar}
        onCopy={handleCopy}
        onPaste={() => void handlePaste()}
      />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}

      {review ? (
        <Modal
          title="Review Changes"
          size="lg"
          onClose={() => setReview(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void executeAll()}>
                Execute All
              </Button>
            </>
          }
        >
          {review.length === 0 ? (
            <p className={styles.message}>No statements to execute.</p>
          ) : (
            <pre className={styles.reviewSql}>
              {review.map((s, i) => (
                <div
                  key={i}
                  className={execError?.stmt === s ? styles.failStmt : undefined}
                >
                  {s}
                </div>
              ))}
            </pre>
          )}
          {execError ? <p className={styles.error}>Error: {execError.message}</p> : null}
        </Modal>
      ) : null}

      {confirmCancel ? (
        <Modal
          title="Discard changes"
          size="sm"
          onClose={() => setConfirmCancel(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                Keep Editing
              </Button>
              <Button variant="danger" onClick={discardChanges}>
                Discard Changes
              </Button>
            </>
          }
        >
          <p>
            Discard {counts.new + counts.modified + counts.deleted} unsaved change
            {counts.new + counts.modified + counts.deleted === 1 ? '' : 's'}? This cannot be undone.
          </p>
        </Modal>
      ) : null}

      {pendingFilter !== null ? (
        <Modal
          title="Unsaved changes"
          size="sm"
          onClose={() => setPendingFilter(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingFilter(null)}>
                Keep Editing
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const q = pendingFilter
                  setPendingFilter(null)
                  void applyFilter(q)
                }}
              >
                Apply Filter &amp; Discard Changes
              </Button>
            </>
          }
        >
          <p>
            You have unsaved changes. Applying a new filter will reload the table and discard your
            changes. Continue?
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className={styles.toast}>{message}</div>
}
