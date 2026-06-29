import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type {
  ColumnInfo,
  DatabaseInfo,
  QueryColumn,
  QueryResult,
  TableInfo,
  TableType,
} from '../../../shared/ipc'
import { generateDisplayNames } from '../../../shared/ipc'
import { type DatabaseDriver, type DriverConfig, nowMs } from './base'
import { DriverError, translateError } from './errors'

type SqliteDb = Database.Database

const SQLITE_EXT = /\.(db|sqlite|sqlite3)$/i

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

interface PragmaColumn {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface PragmaForeignKey {
  from: string
  table: string
  to: string
}

export class SqliteDriver implements DatabaseDriver {
  private db: SqliteDb | null = null
  private readonly config: DriverConfig

  constructor(config: DriverConfig) {
    this.config = config
  }

  private open(): SqliteDb {
    const filePath = this.config.filePath
    if (!filePath) {
      throw new DriverError('No database file selected.', 'SQLITE_CANTOPEN')
    }
    try {
      if (existsSync(filePath)) {
        return new Database(filePath, { fileMustExist: true })
      }
      // File missing: create a new empty DB only when the path looks like a
      // SQLite file; otherwise it's almost certainly a wrong path.
      if (SQLITE_EXT.test(filePath)) {
        return new Database(filePath, { fileMustExist: false })
      }
      throw new DriverError(
        'Cannot open file: check path and permissions',
        'SQLITE_CANTOPEN',
      )
    } catch (err) {
      throw translateError(err, 'sqlite')
    }
  }

  async connect(): Promise<void> {
    this.db = this.open()
  }

  async disconnect(): Promise<void> {
    const db = this.db
    this.db = null
    if (db) db.close()
  }

  async testConnection(): Promise<boolean> {
    const db = this.open()
    try {
      db.prepare('SELECT 1').get()
      return true
    } catch (err) {
      throw translateError(err, 'sqlite')
    } finally {
      db.close()
    }
  }

  async getServerVersion(): Promise<string> {
    try {
      const row = this.require().prepare('SELECT sqlite_version() AS v').get() as { v: string }
      return `SQLite ${row.v}`
    } catch (err) {
      throw translateError(err, 'sqlite')
    }
  }

  async ping(): Promise<boolean> {
    try {
      this.require().prepare('SELECT 1').get()
      return true
    } catch {
      return false
    }
  }

  async query(sql: string): Promise<QueryResult> {
    const db = this.require()
    const started = nowMs()
    try {
      const stmt = db.prepare(sql)
      if (stmt.reader) {
        const columns: QueryColumn[] = stmt.columns().map((c) => ({
          name: c.name,
          displayName: c.name,
          dataType: c.type ?? 'unknown',
        }))
        generateDisplayNames(columns)
        // raw(true) returns positional arrays so duplicate column names don't
        // collide; we re-key by unique displayName.
        const rawRows = stmt.raw(true).all() as unknown[][]
        const rows = rawRows.map((vals) => {
          const o: Record<string, unknown> = {}
          columns.forEach((c, i) => {
            o[c.displayName] = vals[i]
          })
          return o
        })
        return { columns, rows, rowCount: rows.length, durationMs: nowMs() - started, sql }
      }
      const info = stmt.run()
      return {
        columns: [],
        rows: [],
        rowCount: Number(info.changes),
        durationMs: nowMs() - started,
        sql,
      }
    } catch (err) {
      // better-sqlite3's prepare() rejects multi-statement SQL — fall back to exec.
      const message = err instanceof Error ? err.message : String(err)
      if (/cannot prepare|multiple statements|more than one statement/i.test(message)) {
        try {
          db.exec(sql)
          return { columns: [], rows: [], rowCount: 0, durationMs: nowMs() - started, sql }
        } catch (execErr) {
          throw translateError(execErr, 'sqlite')
        }
      }
      throw translateError(err, 'sqlite')
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const filePath = this.config.filePath ?? ''
    // SQLite is a single file — present it as one database.
    return [{ name: path.basename(filePath) || 'database', path: filePath }]
  }

  async listTables(_database: string): Promise<TableInfo[]> {
    try {
      const rows = this.require()
        .prepare(
          `SELECT name, type FROM sqlite_master
           WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string; type: string }>
      return rows.map((r) => ({ name: r.name, type: r.type as TableType }))
    } catch (err) {
      throw translateError(err, 'sqlite')
    }
  }

  async listColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    try {
      const db = this.require()
      const q = quoteIdent(table)
      const cols = db.pragma(`table_info(${q})`) as PragmaColumn[]
      const fks = db.pragma(`foreign_key_list(${q})`) as PragmaForeignKey[]
      const fkMap = new Map(fks.map((f) => [f.from, f]))

      return cols.map((c) => {
        const fk = fkMap.get(c.name)
        const isPrimaryKey = c.pk > 0
        const isForeignKey = fk !== undefined
        return {
          name: c.name,
          dataType: c.type || 'unknown',
          nullable: c.notnull === 0,
          defaultValue: c.dflt_value ?? undefined,
          key: isPrimaryKey ? 'primary' : isForeignKey ? 'foreign' : null,
          isPrimaryKey,
          isForeignKey,
          foreignTable: fk?.table,
          foreignColumn: fk?.to,
        }
      })
    } catch (err) {
      throw translateError(err, 'sqlite')
    }
  }

  async cancel(): Promise<void> {
    // better-sqlite3 is synchronous: a running query blocks the event loop, so
    // there is no in-flight statement to interrupt by the time this is callable.
  }

  private require(): SqliteDb {
    if (!this.db) throw new DriverError('Not connected.')
    return this.db
  }
}
