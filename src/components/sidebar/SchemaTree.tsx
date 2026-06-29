import {
  IconCode,
  IconColumns,
  IconFolder,
  IconKey,
  IconLayoutList,
  IconLink,
  IconTable,
} from '@tabler/icons-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { useTableSelection, tableKey, type TableRef } from '@/store/tableSelectionStore'
import { DatabaseIcon } from '@/components/ui/DatabaseIcon'
import type { DatabaseType } from '@/types/connection'
import type { ColumnInfo, DatabaseNode, TableNode, TableType } from '@/types/schema'
import { TreeRow } from './TreeRow'
import styles from './SchemaTree.module.css'

export type TableContextHandler = (
  e: MouseEvent,
  database: string,
  table: string,
  schema: string | undefined,
) => void

export type DatabaseContextHandler = (e: MouseEvent, database: string) => void

function tableIcon(type: TableType): ReactNode {
  switch (type) {
    case 'view':
    case 'materialized-view':
      return <IconLayoutList size={12} />
    case 'function':
      return <IconCode size={12} />
    default:
      return <IconTable size={12} />
  }
}

function columnIcon(column: ColumnInfo): ReactNode {
  if (column.isPrimaryKey) return <IconKey size={12} className={styles.pk} />
  if (column.isForeignKey) return <IconLink size={12} className={styles.fk} />
  return <IconColumns size={12} />
}

function ColumnRow({ column, depth }: { column: ColumnInfo; depth: number }) {
  const meta = (
    <span className={styles.columnType}>
      {column.dataType}
      {!column.nullable ? <span className={styles.notNull}>NN</span> : null}
    </span>
  )
  return (
    <TreeRow
      depth={depth}
      compact
      label={column.name}
      icon={columnIcon(column)}
      meta={meta}
      title={
        column.isForeignKey && column.foreignTable
          ? `${column.name} → ${column.foreignTable}.${column.foreignColumn ?? ''}`
          : column.name
      }
    />
  )
}

function TableRow({
  connectionId,
  database,
  table,
  siblings,
  depth,
  onTableContextMenu,
}: {
  connectionId: string
  database: string
  table: TableNode
  /** Sibling tables in the same schema/database (for shift-range). */
  siblings: TableNode[]
  depth: number
  onTableContextMenu: TableContextHandler
}) {
  const toggleTable = useConnectionStore((s) => s.toggleTable)
  const openTableTab = useTabStore((s) => s.openTableTab)

  const isTable = table.type === 'table'
  const ref: TableRef = { connectionId, database, schema: table.schema, name: table.name }
  const selected = useTableSelection((s) => s.selected.has(tableKey(ref)))
  const open = (): void => {
    openTableTab({ connectionId, database, table: table.name, schema: table.schema })
  }

  function onActivate(e: MouseEvent): void {
    if (!isTable) {
      open() // views/functions aren't selectable — single click opens
      return
    }
    const sel = useTableSelection.getState()
    if (e.shiftKey) {
      const refs = siblings
        .filter((t) => t.type === 'table' && (t.schema ?? '') === (table.schema ?? ''))
        .map((t): TableRef => ({ connectionId, database, schema: t.schema, name: t.name }))
      sel.selectRange(ref, refs)
    } else if (e.ctrlKey || e.metaKey) {
      sel.toggle(ref)
    } else {
      sel.selectOnly(ref)
    }
  }

  return (
    <>
      <TreeRow
        depth={depth}
        compact
        expandable
        expanded={table.expanded}
        loading={table.expanded && table.loadingColumns}
        label={table.name}
        icon={tableIcon(table.type)}
        selected={selected}
        meta={table.rowCount !== undefined ? <span>{table.rowCount}</span> : undefined}
        onActivate={onActivate}
        onDoubleClick={open}
        onToggle={() => void toggleTable(connectionId, database, table.name)}
        onContextMenu={(e) => onTableContextMenu(e, database, table.name, table.schema)}
      />
      {table.expanded && table.columns
        ? table.columns.length > 0
          ? table.columns.map((c) => <ColumnRow key={c.name} column={c} depth={depth + 1} />)
          : !table.loadingColumns && <EmptyRow depth={depth + 1} label="No columns" />
        : null}
    </>
  )
}

/**
 * Schema grouping node (depth 2). Only rendered for dialects that expose schemas
 * (PostgreSQL); MySQL/SQLite tables carry no schema and stay flat under the DB.
 * Tables are already fully loaded with the database, so expand state is local.
 */
function SchemaRow({
  connectionId,
  database,
  schema,
  tables,
  onTableContextMenu,
}: {
  connectionId: string
  database: string
  schema: string
  tables: TableNode[]
  onTableContextMenu: TableContextHandler
}) {
  const [expanded, setExpanded] = useState(false)
  const toggle = (): void => {
    useTableSelection.getState().clear() // expanding/collapsing a schema clears table selection
    setExpanded((e) => !e)
  }
  return (
    <>
      <TreeRow
        depth={2}
        compact
        expandable
        expanded={expanded}
        label={schema}
        icon={<IconFolder size={12} />}
        onActivate={toggle}
        onToggle={toggle}
      />
      {expanded
        ? tables.map((t) => (
            <TableRow
              key={t.name}
              connectionId={connectionId}
              database={database}
              table={t}
              siblings={tables}
              depth={3}
              onTableContextMenu={onTableContextMenu}
            />
          ))
        : null}
    </>
  )
}

function DatabaseRow({
  connectionId,
  dbType,
  database,
  onTableContextMenu,
  onDatabaseContextMenu,
}: {
  connectionId: string
  dbType: DatabaseType
  database: DatabaseNode
  onTableContextMenu: TableContextHandler
  onDatabaseContextMenu?: DatabaseContextHandler
}) {
  const toggleDatabase = useConnectionStore((s) => s.toggleDatabase)
  const tables = database.tables ?? []
  // Distinct non-empty schemas → render schema grouping nodes (PostgreSQL).
  const schemas = [...new Set(tables.map((t) => t.schema).filter((s): s is string => !!s))].sort()

  function renderTables(): ReactNode {
    if (tables.length === 0) {
      return !database.loadingTables ? <EmptyRow depth={2} label="No tables" /> : null
    }
    if (schemas.length > 0) {
      return schemas.map((sch) => (
        <SchemaRow
          key={sch}
          connectionId={connectionId}
          database={database.name}
          schema={sch}
          tables={tables.filter((t) => t.schema === sch)}
          onTableContextMenu={onTableContextMenu}
        />
      ))
    }
    return tables.map((t) => (
      <TableRow
        key={t.name}
        connectionId={connectionId}
        database={database.name}
        table={t}
        siblings={tables}
        depth={2}
        onTableContextMenu={onTableContextMenu}
      />
    ))
  }

  return (
    <>
      <TreeRow
        depth={1}
        compact
        expandable
        expanded={database.expanded}
        loading={database.expanded && database.loadingTables}
        label={database.name}
        icon={<DatabaseIcon type={dbType} size={14} />}
        meta={database.size ? <span>{database.size}</span> : undefined}
        onActivate={() => {
          useTableSelection.getState().clear() // clicking a database clears table selection
          void toggleDatabase(connectionId, database.name)
        }}
        onToggle={() => void toggleDatabase(connectionId, database.name)}
        onContextMenu={
          onDatabaseContextMenu ? (e) => onDatabaseContextMenu(e, database.name) : undefined
        }
      />
      {database.expanded ? renderTables() : null}
    </>
  )
}

function EmptyRow({ depth, label }: { depth: number; label: string }) {
  return (
    <div className={styles.empty} style={{ paddingLeft: 8 + depth * 12 + 14 }}>
      {label}
    </div>
  )
}

export function SchemaTree({
  connectionId,
  dbType,
  databases,
  onTableContextMenu,
  onDatabaseContextMenu,
}: {
  connectionId: string
  dbType: DatabaseType
  databases: DatabaseNode[]
  onTableContextMenu: TableContextHandler
  onDatabaseContextMenu?: DatabaseContextHandler
}) {
  return (
    <div role="group">
      {databases.map((db) => (
        <DatabaseRow
          key={db.name}
          connectionId={connectionId}
          dbType={dbType}
          database={db}
          onTableContextMenu={onTableContextMenu}
          onDatabaseContextMenu={onDatabaseContextMenu}
        />
      ))}
    </div>
  )
}
