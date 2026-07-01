import { ipcMain } from 'electron'
import {
  IPC,
  type ForeignKeyInfo,
  type IndexInfo,
  type RelatedFunctionInfo,
  type TableDetails,
  type TableRef,
  type TriggerInfo,
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

// ─── Full DDL script (BUG 9) ─────────────────────────────────────────────────

function ddlHeader(title: string): string {
  return `-- ─────────────────────────────────────────\n-- ${title}\n-- ─────────────────────────────────────────`
}
function withSemi(sql: string): string {
  const s = sql.trimEnd()
  return s.endsWith(';') ? s : `${s};`
}

async function pgFullDDL(id: string, sch: string, table: string): Promise<string> {
  const q = qualify('postgresql', sch, table)
  const esc = escapeLiteral
  const relOid = `(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = '${esc(table)}' AND n.nspname = '${esc(sch)}')`
  const sections: string[] = []

  // 1. CREATE TABLE (columns only — constraints come as ALTERs below).
  const cols = await run(
    id,
    `SELECT column_name AS name, data_type AS dt, character_maximum_length AS len, is_nullable AS nn, column_default AS def
     FROM information_schema.columns
     WHERE table_schema = '${esc(sch)}' AND table_name = '${esc(table)}'
     ORDER BY ordinal_position`,
  )
  const colLines = cols.map((c) => {
    const len = num(c.len)
    const dt = len ? `${String(c.dt)}(${len})` : String(c.dt)
    const notNull = c.nn === 'NO' ? ' NOT NULL' : ''
    const def = c.def ? ` DEFAULT ${String(c.def)}` : ''
    return `  ${quoteId('postgresql', String(c.name))} ${dt}${notNull}${def}`
  })
  sections.push(`${ddlHeader('Table')}\nCREATE TABLE ${q} (\n${colLines.join(',\n')}\n);`)

  // 2. Sequences owned by this table's serial columns (heuristic: <table>_%_seq).
  const seqs = await run(
    id,
    `SELECT sequence_name AS n, sequence_schema AS s FROM information_schema.sequences
     WHERE sequence_schema = '${esc(sch)}' AND sequence_name LIKE '${esc(table)}\\_%'`,
  )
  if (seqs.length) {
    sections.push(
      `${ddlHeader('Sequences')}\n${seqs
        .map((r) => `CREATE SEQUENCE IF NOT EXISTS ${quoteId('postgresql', String(r.s))}.${quoteId('postgresql', String(r.n))};`)
        .join('\n')}`,
    )
  }

  // 3. Indexes (excluding constraint-backed ones).
  const idx = await run(
    id,
    `SELECT indexdef AS def FROM pg_indexes
     WHERE schemaname = '${esc(sch)}' AND tablename = '${esc(table)}'
       AND indexname NOT IN (
         SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = '${esc(sch)}' AND table_name = '${esc(table)}')`,
  )
  if (idx.length) sections.push(`${ddlHeader('Indexes')}\n${idx.map((r) => withSemi(String(r.def))).join('\n')}`)

  // 4–7. Constraints (primary, foreign, check, unique) via pg_get_constraintdef.
  const cons = await run(
    id,
    `SELECT conname AS name, pg_get_constraintdef(oid) AS def, contype AS t
     FROM pg_constraint WHERE conrelid = ${relOid}
     ORDER BY CASE contype WHEN 'p' THEN 1 WHEN 'f' THEN 2 WHEN 'c' THEN 3 WHEN 'u' THEN 4 ELSE 5 END`,
  )
  const conSection = (label: string, t: string): void => {
    const list = cons.filter((c) => c.t === t)
    if (!list.length) return
    sections.push(
      `${ddlHeader(label)}\n${list
        .map((c) => `ALTER TABLE ${q} ADD CONSTRAINT ${quoteId('postgresql', String(c.name))} ${String(c.def)};`)
        .join('\n')}`,
    )
  }
  conSection('Primary Key', 'p')
  conSection('Foreign Keys', 'f')
  conSection('Check Constraints', 'c')
  conSection('Unique Constraints', 'u')

  // 8. Triggers.
  const trg = await run(
    id,
    `SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = ${relOid} AND NOT tgisinternal`,
  )
  if (trg.length) sections.push(`${ddlHeader('Triggers')}\n${trg.map((r) => withSemi(String(r.def))).join('\n')}`)

  // 9. Functions executed by those triggers.
  const funcNames = new Set<string>()
  for (const r of trg) {
    const m = /EXECUTE (?:PROCEDURE|FUNCTION)\s+([^\s(]+)/i.exec(String(r.def))
    if (m?.[1]) funcNames.add(m[1].split('.').pop()!.replace(/"/g, ''))
  }
  const fnDefs: string[] = []
  for (const fn of funcNames) {
    const rows = await run(
      id,
      `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.proname = '${esc(fn)}' AND n.nspname = '${esc(sch)}'`,
    ).catch(() => [])
    for (const r of rows) fnDefs.push(withSemi(String(r.def)))
  }
  if (fnDefs.length) sections.push(`${ddlHeader('Functions')}\n${fnDefs.join('\n\n')}`)

  return sections.join('\n\n')
}

async function getFullDDL(ref: TableRef): Promise<string> {
  const { connectionId: id, schema, table } = ref
  const type = connectionManager.getConfig(id).type
  const createTable = await getTableDDL(ref)

  if (type === 'postgresql') {
    return pgFullDDL(id, schema ?? 'public', table)
  }

  if (type === 'sqlite') {
    const esc = escapeLiteral
    const out = [
      '-- SQLite: constraints and foreign keys are defined inline in CREATE TABLE',
      `${ddlHeader('Table')}\n${withSemi(createTable)}`,
    ]
    const idx = await run(
      id,
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${esc(table)}' AND sql IS NOT NULL`,
    )
    if (idx.length) out.push(`${ddlHeader('Indexes')}\n${idx.map((r) => withSemi(String(r.sql))).join('\n')}`)
    const trg = await run(
      id,
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${esc(table)}'`,
    )
    if (trg.length) out.push(`${ddlHeader('Triggers')}\n${trg.map((r) => withSemi(String(r.sql))).join('\n')}`)
    return out.join('\n\n')
  }

  // MySQL: SHOW CREATE TABLE already includes indexes + constraints + FKs.
  const db = schema ?? connectionManager.getConfig(id).database ?? ''
  const esc = escapeLiteral
  const out = [`${ddlHeader('Table')}\n${withSemi(createTable)}`]
  const trg = await run(
    id,
    `SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event, ACTION_STATEMENT AS body
     FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${esc(db)}' AND EVENT_OBJECT_TABLE = '${esc(table)}'`,
  )
  if (trg.length) {
    out.push(
      `${ddlHeader('Triggers')}\n${trg
        .map(
          (r) =>
            `DELIMITER $$\nCREATE TRIGGER \`${String(r.name)}\` ${String(r.timing)} ${String(r.event)} ON \`${table}\` FOR EACH ROW ${String(r.body)}$$\nDELIMITER ;`,
        )
        .join('\n\n')}`,
    )
  }
  const procs = await run(
    id,
    `SELECT ROUTINE_DEFINITION AS body FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = '${esc(db)}' AND ROUTINE_DEFINITION LIKE '%${esc(table)}%'`,
  )
  if (procs.length) {
    out.push(
      `${ddlHeader('Functions / Procedures')}\n${procs
        .map((r) => `DELIMITER $$\n${String(r.body)}\n$$\nDELIMITER ;`)
        .join('\n\n')}`,
    )
  }
  return out.join('\n\n')
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
        isPrimary: String(idx.origin) === 'pk',
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
        isPrimary: name === 'PRIMARY',
        type: String(r.Index_type),
        columns: [],
      }
      entry.columns.push(String(r.Column_name))
      map.set(name, entry)
    }
    return [...map.values()]
  }
  // PostgreSQL — pg_index gives unique/primary flags + access method (btree/gin/…).
  const sch = schema ?? 'public'
  const rows = await run(
    id,
    `SELECT i.relname AS name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
            string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
            am.amname AS index_type
     FROM pg_class t
     JOIN pg_index ix ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_am am ON i.relam = am.oid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
     WHERE t.relname = '${escapeLiteral(table)}'
       AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${escapeLiteral(sch)}')
     GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
     ORDER BY ix.indisprimary DESC, i.relname`,
  )
  return rows.map((r) => ({
    name: String(r.name),
    unique: r.is_unique === true || r.is_unique === 't',
    isPrimary: r.is_primary === true || r.is_primary === 't',
    type: String(r.index_type),
    columns: String(r.columns ?? '').split(',').map((c) => c.trim()).filter(Boolean),
  }))
}

// ─── Foreign keys ─────────────────────────────────────────────────────────────

async function getForeignKeys(ref: TableRef): Promise<ForeignKeyInfo[]> {
  const { connectionId: id, database, schema, table } = ref
  const type = connectionManager.getConfig(id).type

  if (type === 'sqlite') {
    const rows = await run(id, `PRAGMA foreign_key_list(${quoteId(type, table)})`)
    return rows.map((r) => ({
      column: String(r.from),
      referencedTable: String(r.table),
      referencedColumn: String(r.to),
      onUpdate: r.on_update ? String(r.on_update) : undefined,
      onDelete: r.on_delete ? String(r.on_delete) : undefined,
    }))
  }
  if (type === 'mysql') {
    const db = schema ?? database
    const rows = await run(
      id,
      `SELECT kcu.CONSTRAINT_NAME AS name, kcu.COLUMN_NAME AS col,
              kcu.REFERENCED_TABLE_SCHEMA AS fs, kcu.REFERENCED_TABLE_NAME AS rt,
              kcu.REFERENCED_COLUMN_NAME AS rc, rc.UPDATE_RULE AS upd, rc.DELETE_RULE AS del
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       WHERE kcu.TABLE_SCHEMA = '${escapeLiteral(db)}' AND kcu.TABLE_NAME = '${escapeLiteral(table)}'
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
    )
    return rows.map((r) => ({
      name: String(r.name),
      column: String(r.col),
      foreignSchema: r.fs ? String(r.fs) : undefined,
      referencedTable: String(r.rt),
      referencedColumn: String(r.rc),
      onUpdate: r.upd ? String(r.upd) : undefined,
      onDelete: r.del ? String(r.del) : undefined,
    }))
  }
  // PostgreSQL
  const sch = schema ?? 'public'
  const rows = await run(
    id,
    `SELECT tc.constraint_name AS name, kcu.column_name AS col,
            ccu.table_schema AS fs, ccu.table_name AS rt, ccu.column_name AS rc,
            rc.update_rule AS upd, rc.delete_rule AS del
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = '${escapeLiteral(sch)}' AND tc.table_name = '${escapeLiteral(table)}'`,
  )
  return rows.map((r) => ({
    name: String(r.name),
    column: String(r.col),
    foreignSchema: r.fs ? String(r.fs) : undefined,
    referencedTable: String(r.rt),
    referencedColumn: String(r.rc),
    onUpdate: r.upd ? String(r.upd) : undefined,
    onDelete: r.del ? String(r.del) : undefined,
  }))
}

// ─── Triggers ──────────────────────────────────────────────────────────────────

async function getTriggers(ref: TableRef): Promise<TriggerInfo[]> {
  const { connectionId: id, database, schema, table } = ref
  const type = connectionManager.getConfig(id).type

  if (type === 'sqlite') {
    const rows = await run(
      id,
      `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${escapeLiteral(table)}'`,
    )
    return rows.map((r) => {
      const sql = String(r.sql ?? '')
      return {
        name: String(r.name),
        timing: /\b(BEFORE|AFTER|INSTEAD OF)\b/i.exec(sql)?.[1]?.toUpperCase() ?? '',
        event: /\b(INSERT|UPDATE|DELETE)\b/i.exec(sql)?.[1]?.toUpperCase() ?? '',
        body: sql,
      }
    })
  }

  // pg + mysql share information_schema.triggers; one row per event → group by name.
  const rows =
    type === 'mysql'
      ? await run(
          id,
          `SELECT TRIGGER_NAME AS name, EVENT_MANIPULATION AS event, ACTION_TIMING AS timing,
                  ACTION_STATEMENT AS body
           FROM information_schema.TRIGGERS
           WHERE TRIGGER_SCHEMA = '${escapeLiteral(schema ?? database)}'
             AND EVENT_OBJECT_TABLE = '${escapeLiteral(table)}'
           ORDER BY TRIGGER_NAME`,
        )
      : await run(
          id,
          `SELECT trigger_name AS name, event_manipulation AS event, action_timing AS timing,
                  action_statement AS body
           FROM information_schema.triggers
           WHERE event_object_schema = '${escapeLiteral(schema ?? 'public')}'
             AND event_object_table = '${escapeLiteral(table)}'
           ORDER BY trigger_name`,
        )
  const map = new Map<string, TriggerInfo>()
  for (const r of rows) {
    const name = String(r.name)
    const entry = map.get(name)
    if (entry) {
      if (!entry.event.includes(String(r.event))) entry.event += `/${String(r.event)}`
    } else {
      map.set(name, {
        name,
        event: String(r.event),
        timing: String(r.timing),
        body: String(r.body ?? ''),
      })
    }
  }
  return [...map.values()]
}

// ─── Related functions ─────────────────────────────────────────────────────────

async function getRelatedFunctions(ref: TableRef): Promise<RelatedFunctionInfo[]> {
  const { connectionId: id, database, schema, table } = ref
  const type = connectionManager.getConfig(id).type

  if (type === 'sqlite') return [] // SQLite has no stored functions; UI shows a notice.

  if (type === 'mysql') {
    const db = schema ?? database
    const rows = await run(
      id,
      `SELECT ROUTINE_NAME AS name, DTD_IDENTIFIER AS ret, ROUTINE_DEFINITION AS def
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = '${escapeLiteral(db)}'
         AND ROUTINE_DEFINITION LIKE '%${escapeLiteral(table)}%'
       ORDER BY ROUTINE_NAME`,
    )
    return rows.map((r) => ({
      name: String(r.name),
      arguments: '',
      returnType: r.ret ? String(r.ret) : '',
      definition: String(r.def ?? ''),
    }))
  }
  // PostgreSQL — prokind='f' avoids pg_get_functiondef errors on aggregates/windows.
  const sch = schema ?? 'public'
  const rows = await run(
    id,
    `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def,
            pg_get_function_arguments(p.oid) AS args, t.typname AS ret
     FROM pg_proc p
     JOIN pg_type t ON t.oid = p.prorettype
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${escapeLiteral(sch)}' AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) ILIKE '%${escapeLiteral(table)}%'
     ORDER BY p.proname`,
  )
  return rows.map((r) => ({
    name: String(r.name),
    arguments: String(r.args ?? ''),
    returnType: String(r.ret ?? ''),
    definition: String(r.def ?? ''),
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
  handle(IPC.SCHEMA.GET_FULL_DDL, getFullDDL)
  handle(IPC.SCHEMA.GET_TABLE_INFO, getTableInfo)
  handle(IPC.SCHEMA.GET_INDEXES, getIndexes)
  handle(IPC.SCHEMA.GET_FOREIGN_KEYS, getForeignKeys)
  handle(IPC.SCHEMA.GET_TRIGGERS, getTriggers)
  handle(IPC.SCHEMA.GET_RELATED_FUNCTIONS, getRelatedFunctions)
}
