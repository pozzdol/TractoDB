import { Suspense, lazy, useMemo } from 'react'
import { useTabStore, type QueryEditorTab } from '@/store/tabStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useUiStore } from '@/store/uiStore'
import { useQuery } from '@/hooks/useQuery'
import type { ConnectionState } from '@/types/connection'
import { dialectFor } from './dialect'
import { QueryToolbar } from './QueryToolbar'
import type { ColumnMeta, EditorSchema, TableMeta } from './autocomplete/schemaCache'
import styles from './QueryView.module.css'

// Lazy-load the Monaco-bearing editor so it stays out of the main bundle.
const QueryEditor = lazy(() =>
  import('./QueryEditor').then((m) => ({ default: m.QueryEditor })),
)

/** Build the editor's schema view from the connection's loaded tree. */
function collectSchema(
  conn: ConnectionState | undefined,
  database: string | null,
): EditorSchema | null {
  if (!conn) return null
  const tables: TableMeta[] = []
  const preloaded = new Map<string, ColumnMeta[]>()
  conn.databases.forEach((db) =>
    db.tables?.forEach((t) => {
      tables.push({ name: t.name, isView: t.type === 'view' })
      if (t.columns) {
        preloaded.set(
          t.name.toLowerCase(),
          t.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            isPrimaryKey: c.isPrimaryKey,
            isForeignKey: c.isForeignKey,
          })),
        )
      }
    }),
  )
  return { connectionId: conn.config.id, database, tables, preloaded }
}

export function QueryView({ tab }: { tab: QueryEditorTab }) {
  const updateQuerySql = useTabStore((s) => s.updateQuerySql)
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const conn = useConnectionStore((s) =>
    s.connections.find((c) => c.config.id === tab.connectionId),
  )
  const { execution, run, cancel } = useQuery(tab.id)

  const connected = conn?.status === 'connected'
  const language = dialectFor(conn?.config.type ?? 'sql')
  const database = tab.database ?? conn?.config.database ?? null
  const schema = useMemo(() => collectSchema(conn, database), [conn, database])

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
        sql={tab.sql}
        connectionId={tab.connectionId}
        savedQueryId={tab.savedQueryId}
        savedQueryName={tab.title}
        onSaved={(id, name) => {
          const ts = useTabStore.getState()
          ts.setSavedQueryId(tab.id, id)
          ts.setTabTitle(tab.id, name)
        }}
      />
      <Suspense fallback={<div className={styles.loading}>Loading editor…</div>}>
        <QueryEditor
          value={tab.sql}
          language={language}
          isDark={isDark}
          schema={schema}
          onChange={(v) => updateQuerySql(tab.id, v)}
          onRun={() => doRun('')}
          onRunSelection={(sel) => doRun(sel)}
        />
      </Suspense>
    </div>
  )
}
