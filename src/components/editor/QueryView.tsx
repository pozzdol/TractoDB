import { Suspense, lazy, useMemo } from 'react'
import { useTabStore, type QueryEditorTab } from '@/store/tabStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useUiStore } from '@/store/uiStore'
import { useQuery } from '@/hooks/useQuery'
import type { ConnectionState } from '@/types/connection'
import { dialectFor } from './dialect'
import { QueryToolbar } from './QueryToolbar'
import type { ColumnMeta } from './autocomplete/schemaCache'
import styles from './QueryView.module.css'

// Lazy-load the Monaco-bearing editor so it stays out of the main bundle.
const QueryEditor = lazy(() =>
  import('./QueryEditor').then((m) => ({ default: m.QueryEditor })),
)

interface Schema {
  tables: string[]
  columns: string[]
  tableColumns: Map<string, ColumnMeta[]>
  tableNames: string[]
}

function collectSchema(conn: ConnectionState | undefined): Schema {
  const tables = new Set<string>()
  const columns = new Set<string>()
  const tableColumns = new Map<string, ColumnMeta[]>()
  const tableNames: string[] = []
  conn?.databases.forEach((db) =>
    db.tables?.forEach((t) => {
      tables.add(t.name)
      tableNames.push(t.name.toLowerCase())
      if (t.columns) {
        tableColumns.set(
          t.name.toLowerCase(),
          t.columns.map((c) => ({ name: c.name, dataType: c.dataType, isPrimaryKey: c.isPrimaryKey })),
        )
        t.columns.forEach((c) => columns.add(c.name))
      }
    }),
  )
  return { tables: [...tables], columns: [...columns], tableColumns, tableNames }
}

export function QueryView({ tab }: { tab: QueryEditorTab }) {
  const updateQuerySql = useTabStore((s) => s.updateQuerySql)
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const conn = useConnectionStore((s) =>
    s.connections.find((c) => c.config.id === tab.connectionId),
  )
  const { execution, run, cancel } = useQuery(tab.id)

  const connected = conn?.status === 'connected'
  const { tables, columns, tableColumns, tableNames } = useMemo(() => collectSchema(conn), [conn])
  const language = dialectFor(conn?.config.type ?? 'sql')
  const database = tab.database ?? conn?.config.database ?? null

  function doRun(selection: string): void {
    const text = selection.trim() || tab.sql.trim()
    if (!connected || !tab.connectionId || !text) return
    void run(tab.connectionId, text, database)
  }

  return (
    <div className={styles.view}>
      <QueryToolbar
        connectionName={conn?.config.name}
        database={database}
        dbType={conn?.config.type}
        status={execution.status}
        readOnly={conn?.config.environment === 'production'}
        canRun={connected && tab.sql.trim().length > 0}
        onRun={() => doRun('')}
        onStop={() => {
          if (tab.connectionId) void cancel(tab.connectionId)
        }}
      />
      <Suspense fallback={<div className={styles.loading}>Loading editor…</div>}>
        <QueryEditor
          value={tab.sql}
          language={language}
          isDark={isDark}
          tables={tables}
          columns={columns}
          connectionId={tab.connectionId}
          database={database}
          tableColumns={tableColumns}
          tableNames={tableNames}
          onChange={(v) => updateQuerySql(tab.id, v)}
          onRun={() => doRun('')}
          onRunSelection={(sel) => doRun(sel)}
        />
      </Suspense>
    </div>
  )
}
