import {
  IconCode,
  IconColumns,
  IconKey,
  IconLayoutList,
  IconLink,
  IconTable,
} from '@tabler/icons-react'
import type { MouseEvent, ReactNode } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { useTabStore } from '@/store/tabStore'
import { DatabaseIcon } from '@/components/ui/DatabaseIcon'
import type { DatabaseType } from '@/types/connection'
import type { ColumnInfo, DatabaseNode, TableNode, TableType } from '@/types/schema'
import { TreeRow } from './TreeRow'
import styles from './SchemaTree.module.css'

export type TableContextHandler = (
  e: MouseEvent,
  database: string,
  table: string,
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

function ColumnRow({ column }: { column: ColumnInfo }) {
  const meta = (
    <span className={styles.columnType}>
      {column.dataType}
      {!column.nullable ? <span className={styles.notNull}>NN</span> : null}
    </span>
  )
  return (
    <TreeRow
      depth={3}
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
  onTableContextMenu,
}: {
  connectionId: string
  database: string
  table: TableNode
  onTableContextMenu: TableContextHandler
}) {
  const toggleTable = useConnectionStore((s) => s.toggleTable)
  const openTableTab = useTabStore((s) => s.openTableTab)

  return (
    <>
      <TreeRow
        depth={2}
        compact
        expandable
        expanded={table.expanded}
        loading={table.expanded && table.loadingColumns}
        label={table.name}
        icon={tableIcon(table.type)}
        meta={table.rowCount !== undefined ? <span>{table.rowCount}</span> : undefined}
        onActivate={() =>
          openTableTab({ connectionId, database, table: table.name, schema: table.schema })
        }
        onToggle={() => void toggleTable(connectionId, database, table.name)}
        onContextMenu={(e) => onTableContextMenu(e, database, table.name)}
      />
      {table.expanded && table.columns
        ? table.columns.length > 0
          ? table.columns.map((c) => <ColumnRow key={c.name} column={c} />)
          : !table.loadingColumns && <EmptyRow depth={3} label="No columns" />
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
        onActivate={() => void toggleDatabase(connectionId, database.name)}
        onToggle={() => void toggleDatabase(connectionId, database.name)}
        onContextMenu={
          onDatabaseContextMenu ? (e) => onDatabaseContextMenu(e, database.name) : undefined
        }
      />
      {database.expanded && database.tables
        ? database.tables.length > 0
          ? database.tables.map((t) => (
              <TableRow
                key={t.name}
                connectionId={connectionId}
                database={database.name}
                table={t}
                onTableContextMenu={onTableContextMenu}
              />
            ))
          : !database.loadingTables && <EmptyRow depth={2} label="No tables" />
        : null}
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
