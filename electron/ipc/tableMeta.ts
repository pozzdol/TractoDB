import { ipcMain } from 'electron'
import {
  IPC,
  type ForeignKeyInfo,
  type IndexInfo,
  type TableDetails,
  type TableRef,
  ipcError,
  ipcSuccess,
} from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'
import { escapeLiteral, qualify, quoteId } from './sqlUtil'

type Row = Record<string, unknown>

async function run(connectionId: string, sql: string): Promise<Row[]> {
  return (await connectionManager.getDriver(connectionId).query(sql)).rows
}

function num(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function prettyBytes(bytes: number | undefined): string | undefined {
  if (bytes === undefined) return undefined
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ─── DDL ────────────────────────────────────────────────────────────────────

async function getTableDDL(ref: TableRef): Promise<string> {
  const { connectionId: id, schema, table } = ref
  const type = connectionManager.getConfig(id).type
  const q = qualify(type, schema, table)

  if (type === 'sqlite') {
    const rows = await run(id, `SELECT sql FROM sqlite_master WHERE name = '${escapeLiteral(table)}'`)
    return (rows[0]?.sql as string) ?? `-- No DDL found for ${table}`
  }
  if (type === 'mysql') {
    const rows = await run(id, `SHOW CREATE TABLE ${q}`)
    const values = Object.values(rows[0] ?? {})
    return (values[1] as string) ?? `-- No DDL found for ${table}`
  }
  // PostgreSQL: reconstruct from information_schema.
  const sch = schema ?? 'public'
  const cols = await run(
    id,
    `SELECT column_name, data_type, character_maximum_length AS len, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = '${escapeLiteral(sch)}' AND table_name = '${escapeLiteral(table)}'
     ORDER BY ordinal_position`,
  )
  const pks = await run(
    id,
    `SELECT kcu.column_name AS name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '${escapeLiteral(sch)}'
       AND tc.table_name = '${escapeLiteral(table)}'`,
  )
  const lines = cols.map((c) => {
    const len = num(c.len)
    const dataType = len ? `${String(c.data_type)}(${len})` : String(c.data_type)
    const notNull = c.is_nullable === 'NO' ? ' NOT NULL' : ''
    const def = c.column_default ? ` DEFAULT ${String(c.column_default)}` : ''
    return `  ${quoteId(type, String(c.column_name))} ${dataType}${notNull}${def}`
  })
  if (pks.length > 0) {
    lines.push(`  PRIMARY KEY (${pks.map((p) => quoteId(type, String(p.name))).join(', ')})`)
  }
  return `CREATE TABLE ${q} (\n${lines.join(',\n')}\n);`
}

// ─── Info ───────────────────────────────────────────────────────────────────

async function getTableInfo(ref: TableRef): Promise<TableDetails> {
  const { connectionId: id, schema, table } = ref
  const type = connectionManager.getConfig(id).type
  const q = qualify(type, schema, table)
  const details: TableDetails = { name: table, schema }

  const countRows = await run(id, `SELECT COUNT(*) AS c FROM ${q}`)
  details.rowCount = num(countRows[0]?.c)

  if (type === 'postgresql') {
    const sch = schema ?? 'public'
    const rows = await run(
      id,
      `SELECT pg_size_pretty(pg_total_relation_size('${escapeLiteral(sch)}.${escapeLiteral(table)}')) AS size,
              obj_description('${escapeLiteral(sch)}.${escapeLiteral(table)}'::regclass) AS comment,
              (SELECT tableowner FROM pg_tables WHERE schemaname='${escapeLiteral(sch)}' AND tablename='${escapeLiteral(table)}') AS owner`,
    )
    const r = rows[0]
    details.sizePretty = (r?.size as string) ?? undefined
    details.comment = (r?.comment as string) ?? undefined
    details.owner = (r?.owner as string) ?? undefined
  } else if (type === 'mysql') {
    const rows = await run(
      id,
      `SELECT table_comment AS comment, (data_length + index_length) AS bytes
       FROM information_schema.tables
       WHERE table_schema = '${escapeLiteral(schema ?? '')}' AND table_name = '${escapeLiteral(table)}'`,
    )
    details.comment = (rows[0]?.comment as string) || undefined
    details.sizePretty = prettyBytes(num(rows[0]?.bytes))
  }
  return details
}

// ─── Indexes ──────────────────────────────────────────────────────────────────

async function getIndexes(ref: TableRef): Promise<IndexInfo[]> {
  const { connectionId: id, schema, table } = ref
  const type = connectionManager.getConfig(id).type

  if (type === 'sqlite') {
    const list = await run(id, `PRAGMA index_list(${quoteId(type, table)})`)
    const out: IndexInfo[] = []
    for (const idx of list) {
      const name = String(idx.name)
      const info = await run(id, `PRAGMA index_info(${quoteId(type, name)})`)
      out.push({
        name,
        unique: Number(idx.unique) === 1,
        columns: info.map((c) => String(c.name)),
      })
    }
    return out
  }
  if (type === 'mysql') {
    const rows = await run(id, `SHOW INDEX FROM ${qualify(type, schema, table)}`)
    const map = new Map<string, IndexInfo>()
    for (const r of rows) {
      const name = String(r.Key_name)
      const entry = map.get(name) ?? {
        name,
        unique: Number(r.Non_unique) === 0,
        type: String(r.Index_type),
        columns: [],
      }
      entry.columns.push(String(r.Column_name))
      map.set(name, entry)
    }
    return [...map.values()]
  }
  // PostgreSQL
  const sch = schema ?? 'public'
  const rows = await run(
    id,
    `SELECT indexname AS name, indexdef AS def
     FROM pg_indexes WHERE schemaname='${escapeLiteral(sch)}' AND tablename='${escapeLiteral(table)}'`,
  )
  return rows.map((r) => {
    const def = String(r.def)
    const cols = /\(([^)]*)\)/.exec(def)?.[1] ?? ''
    return {
      name: String(r.name),
      unique: /UNIQUE/i.test(def),
      columns: cols.split(',').map((c) => c.trim().replace(/"/g, '')),
    }
  })
}

// ─── Foreign keys ─────────────────────────────────────────────────────────────

async function getForeignKeys(ref: TableRef): Promise<ForeignKeyInfo[]> {
  const { connectionId: id, schema, table } = ref
  const type = connectionManager.getConfig(id).type

  if (type === 'sqlite') {
    const rows = await run(id, `PRAGMA foreign_key_list(${quoteId(type, table)})`)
    return rows.map((r) => ({
      column: String(r.from),
      referencedTable: String(r.table),
      referencedColumn: String(r.to),
    }))
  }
  const rows = await run(
    id,
    `SELECT constraint_name AS name, column_name, referenced_table_name AS rt, referenced_column_name AS rc
     FROM information_schema.key_column_usage
     WHERE table_schema = '${escapeLiteral(schema ?? '')}' AND table_name = '${escapeLiteral(table)}'
       AND referenced_table_name IS NOT NULL`,
  )
  return rows.map((r) => ({
    name: String(r.name),
    column: String(r.column_name),
    referencedTable: String(r.rt),
    referencedColumn: String(r.rc),
  }))
}

// ─── Registration ─────────────────────────────────────────────────────────────

function handle<T>(channel: string, run: (ref: TableRef) => Promise<T>): void {
  ipcMain.handle(channel, async (_e, ref: TableRef) => {
    try {
      return ipcSuccess(await run(ref))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}

export function registerTableMetaHandlers(): void {
  handle(IPC.SCHEMA.GET_TABLE_DDL, getTableDDL)
  handle(IPC.SCHEMA.GET_TABLE_INFO, getTableInfo)
  handle(IPC.SCHEMA.GET_INDEXES, getIndexes)
  handle(IPC.SCHEMA.GET_FOREIGN_KEYS, getForeignKeys)
}
