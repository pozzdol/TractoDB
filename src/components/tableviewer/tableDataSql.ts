// Pure SQL generation + edit-row bookkeeping for the table data editor.
// Kept free of React/component state so it stays testable and TableData stays lean.
import { quoteIdent } from '@/lib/sqlIdent'
import type { ColumnFilter } from '@/lib/columnTypeGroups'
import type { DatabaseType } from '@/types/connection'
import type { QueryColumn } from '@/types/query'

export type Row = Record<string, unknown>
export type RowState = 'new' | 'modified' | 'deleted' | 'unchanged'

export interface EditRow {
  rowId: string
  original: Row | null // null for new rows
  current: Row
  state: RowState
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function valEq(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true
  return String(a) === String(b)
}

/** Dialect-aware WHERE predicate for one typed column filter (BUG 10). */
export function filterSql(dbType: DatabaseType, col: string, f: ColumnFilter): string {
  const q = quoteIdent(dbType, col)
  const esc = (s: string): string => s.replace(/'/g, "''")
  const textCast = dbType === 'mysql' ? `CAST(${q} AS CHAR)` : `${q}::text`
  const numLit = (s: string): string => (s.trim() === '' || Number.isNaN(Number(s)) ? 'NULL' : String(Number(s)))
  switch (f.kind) {
    case 'values': {
      if (f.values.length === 0) return '1 = 0'
      const nonNull = f.values.filter((v) => v !== null && v !== undefined)
      const sub: string[] = []
      if (nonNull.length) sub.push(`${q} IN (${nonNull.map(literal).join(', ')})`)
      if (f.values.length > nonNull.length) sub.push(`${q} IS NULL`)
      return sub.length > 1 ? `(${sub.join(' OR ')})` : (sub[0] ?? '1 = 1')
    }
    case 'text':
      switch (f.mode) {
        case 'contains': return `${textCast} LIKE '%${esc(f.value)}%'`
        case 'starts': return `${textCast} LIKE '${esc(f.value)}%'`
        case 'ends': return `${textCast} LIKE '%${esc(f.value)}'`
        case 'exact': return `${textCast} = '${esc(f.value)}'`
        case 'keyExists': return `${q} ? '${esc(f.value)}'`
        case 'null': return `${q} IS NULL`
        case 'notNull': return `${q} IS NOT NULL`
      }
      return '1 = 1'
    case 'numeric':
      switch (f.mode) {
        case 'between': return `${q} BETWEEN ${numLit(f.min)} AND ${numLit(f.max)}`
        case 'gt': return `${q} > ${numLit(f.min)}`
        case 'lt': return `${q} < ${numLit(f.max)}`
        case 'eq': return `${q} = ${numLit(f.value)}`
        case 'null': return `${q} IS NULL`
        case 'notNull': return `${q} IS NOT NULL`
      }
      return '1 = 1'
    case 'date':
      switch (f.mode) {
        case 'between': return `${q} >= '${esc(f.from)}' AND ${q} <= '${esc(f.to)}'`
        case 'after': return `${q} >= '${esc(f.from)}'`
        case 'before': return `${q} <= '${esc(f.to)}'`
        case 'null': return `${q} IS NULL`
        case 'notNull': return `${q} IS NOT NULL`
      }
      return '1 = 1'
  }
}

export function buildStatements(
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

export function countByState(editRows: EditRow[]): { modified: number; new: number; deleted: number } {
  return {
    modified: editRows.filter((r) => r.state === 'modified').length,
    new: editRows.filter((r) => r.state === 'new').length,
    deleted: editRows.filter((r) => r.state === 'deleted').length,
  }
}

export function dirtySummary(c: { modified: number; new: number; deleted: number }): string {
  const parts: string[] = []
  if (c.new) parts.push(`${c.new} new`)
  if (c.modified) parts.push(`${c.modified} modified`)
  if (c.deleted) parts.push(`${c.deleted} deleted`)
  return parts.join(', ')
}
