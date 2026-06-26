import { useCallback, useEffect, useState } from 'react'
import { DataGrid } from '@/components/grid/DataGrid'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { qualifiedName, quoteIdent } from '@/lib/sqlIdent'
import type { QueryColumn } from '@/types/query'
import type { TableTabProps } from './TableViewer'
import styles from './TableData.module.css'

type Row = Record<string, unknown>
const PAGE = 100

interface PendingEdit {
  row: Row
  column: string
  value: string
  sql: string
}

export function TableData({ connectionId, database, schema, table, dbType, readOnly }: TableTabProps) {
  const qualified = qualifiedName(dbType, schema, table)

  const [columns, setColumns] = useState<QueryColumn[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [pkColumn, setPkColumn] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingEdit | null>(null)

  const loadPage = useCallback(
    async (offset: number) => {
      const res = await api().query.execute(
        connectionId,
        `SELECT * FROM ${qualified}`,
        database,
        offset,
        PAGE,
      )
      if (!res.success) {
        setError(res.error)
        return
      }
      const data = res.data
      setColumns(data.columns)
      setTotalCount(data.totalCount)
      setHasMore(Boolean(data.hasMore))
      setRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]))
    },
    [connectionId, qualified, database],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setRows([])
    void (async () => {
      const cols = await api().schema.listColumns(connectionId, database, schema ? `${schema}.${table}` : table)
      if (!cancelled && cols.success) {
        setPkColumn(cols.data.find((c) => c.isPrimaryKey)?.name ?? null)
      }
      await loadPage(0)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table, loadPage])

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await loadPage(rows.length)
    setLoadingMore(false)
  }

  function requestEdit(row: Row, column: string, value: string): void {
    if (!pkColumn) return
    const pkVal = row[pkColumn]
    const lit = typeof pkVal === 'number' ? String(pkVal) : `'${String(pkVal)}'`
    const sql = `UPDATE ${qualified} SET ${quoteIdent(dbType, column)} = '${value}' WHERE ${quoteIdent(dbType, pkColumn)} = ${lit}`
    setPending({ row, column, value, sql })
  }

  async function confirmEdit(): Promise<void> {
    if (!pending || !pkColumn) return
    const { row, column, value } = pending
    const res = await api().table.updateCell({
      connectionId,
      database,
      schema,
      table,
      pkColumn,
      pkValue: row[pkColumn],
      column,
      value,
    })
    setPending(null)
    if (!res.success) {
      setError(res.error)
      return
    }
    setRows((rs) => rs.map((r) => (r === row ? { ...r, [column]: value } : r)))
  }

  if (loading) return <div className={styles.message}>Loading…</div>
  if (error) return <div className={styles.error}>{error}</div>

  return (
    <div className={styles.wrap}>
      <div className={styles.statusBar}>
        {totalCount !== undefined
          ? hasMore
            ? `Showing ${rows.length} of ${totalCount.toLocaleString()} rows`
            : `All ${totalCount.toLocaleString()} rows loaded`
          : `${rows.length} rows`}
        {readOnly ? <span className={styles.ro}>read-only</span> : null}
        {!readOnly && !pkColumn ? (
          <span className={styles.ro}>no primary key — editing disabled</span>
        ) : null}
      </div>
      <DataGrid
        columns={columns}
        rows={rows}
        gridKey={`${connectionId}/${database}/${schema ? `${schema}.` : ''}${table}`}
        hasMore={hasMore}
        isLoadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        editable={!readOnly && pkColumn !== null}
        onEditCommit={(row, column, value) => requestEdit(row, column, value)}
        tableName={qualified}
      />
      {pending ? (
        <Modal
          title="Confirm update"
          size="md"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void confirmEdit()}>
                Update
              </Button>
            </>
          }
        >
          <p className={styles.confirmText}>Run this statement?</p>
          <pre className={styles.confirmSql}>{pending.sql}</pre>
        </Modal>
      ) : null}
    </div>
  )
}
