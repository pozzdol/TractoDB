import mysql from 'mysql2/promise'
import type { FieldPacket, Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise'
import type {
  ColumnInfo,
  DatabaseInfo,
  QueryColumn,
  QueryResult,
  TableInfo,
  TableType,
} from '../../../shared/ipc'
import { type DatabaseDriver, type DriverConfig, nowMs, withTimeout } from './base'
import { translateError } from './errors'

const CONNECT_TIMEOUT_MS = 10_000
const PING_TIMEOUT_MS = 3_000
const POOL_MAX = 5
const SYSTEM_SCHEMAS = new Set(['information_schema', 'performance_schema', 'sys', 'mysql'])

/** Common MySQL protocol type codes → readable names. */
const MYSQL_TYPE: Record<number, string> = {
  0: 'decimal',
  1: 'tinyint',
  2: 'smallint',
  3: 'int',
  4: 'float',
  5: 'double',
  7: 'timestamp',
  8: 'bigint',
  9: 'mediumint',
  10: 'date',
  11: 'time',
  12: 'datetime',
  13: 'year',
  15: 'varchar',
  16: 'bit',
  245: 'json',
  246: 'decimal',
  248: 'set',
  249: 'tinytext',
  250: 'mediumtext',
  251: 'longtext',
  252: 'text',
  253: 'varchar',
  254: 'char',
  255: 'geometry',
}

function mysqlTypeName(code: number | undefined): string {
  return (code !== undefined && MYSQL_TYPE[code]) || 'unknown'
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``
}

function tableType(raw: string): TableType {
  return /VIEW/i.test(raw) ? 'view' : 'table'
}

export class MySqlDriver implements DatabaseDriver {
  private poolInstance: Pool | null = null
  private readonly config: DriverConfig
  private currentThreadId: number | null = null

  constructor(config: DriverConfig) {
    this.config = config
  }

  private poolOptions(): mysql.PoolOptions {
    return {
      host: this.config.host,
      port: this.config.port ?? 3306,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      connectionLimit: POOL_MAX,
      multipleStatements: false,
    }
  }

  async connect(): Promise<void> {
    const pool = mysql.createPool(this.poolOptions())
    try {
      const conn = await withTimeout(
        pool.getConnection(),
        CONNECT_TIMEOUT_MS,
        'Connection timed out — check host, port, and firewall.',
      )
      conn.release()
      this.poolInstance = pool
    } catch (err) {
      await pool.end().catch(() => undefined)
      throw translateError(err, 'mysql')
    }
  }

  async disconnect(): Promise<void> {
    const pool = this.poolInstance
    this.poolInstance = null
    this.currentThreadId = null
    if (pool) await pool.end().catch(() => undefined)
  }

  async testConnection(): Promise<boolean> {
    const pool = mysql.createPool({ ...this.poolOptions(), connectionLimit: 1 })
    try {
      await withTimeout(pool.query('SELECT 1'), CONNECT_TIMEOUT_MS, 'Connection test timed out.')
      return true
    } catch (err) {
      throw translateError(err, 'mysql')
    } finally {
      await pool.end().catch(() => undefined)
    }
  }

  async getServerVersion(): Promise<string> {
    try {
      const [rows] = await this.requirePool().query('SELECT VERSION() AS v')
      const v = (rows as Array<{ v?: string }>)[0]?.v ?? 'unknown'
      const label = /mariadb/i.test(v) ? 'MariaDB' : 'MySQL'
      return `${label} ${v.replace(/-MariaDB.*/i, '')}`
    } catch (err) {
      throw translateError(err, 'mysql')
    }
  }

  async ping(): Promise<boolean> {
    try {
      await withTimeout(this.requirePool().query('SELECT 1'), PING_TIMEOUT_MS, 'Ping timed out.')
      return true
    } catch {
      return false
    }
  }

  async query(sql: string): Promise<QueryResult> {
    const started = nowMs()
    let conn: PoolConnection
    try {
      conn = await this.requirePool().getConnection()
    } catch (err) {
      throw translateError(err, 'mysql')
    }
    this.currentThreadId = conn.threadId ?? null
    try {
      const [resultRaw, fieldsRaw] = await conn.query(sql)
      let columns: QueryColumn[] = []
      let rows: Record<string, unknown>[] = []
      let rowCount: number

      if (Array.isArray(resultRaw)) {
        const fields = (fieldsRaw ?? []) as FieldPacket[]
        columns = fields.map((f) => ({ name: f.name, dataType: mysqlTypeName(f.type) }))
        rows = resultRaw as unknown as Record<string, unknown>[]
        rowCount = rows.length
      } else {
        rowCount = (resultRaw as ResultSetHeader).affectedRows ?? 0
      }
      return { columns, rows, rowCount, durationMs: nowMs() - started, sql }
    } catch (err) {
      throw translateError(err, 'mysql')
    } finally {
      this.currentThreadId = null
      conn.release()
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    if (this.config.databaseMode === 'single' && this.config.database) {
      return [{ name: this.config.database }]
    }
    try {
      const [rows] = await this.requirePool().query('SHOW DATABASES')
      return (rows as Array<Record<string, string>>)
        .map((r) => Object.values(r)[0] ?? '')
        .filter((name) => name && !SYSTEM_SCHEMAS.has(name))
        .map((name) => ({ name }))
    } catch (err) {
      throw translateError(err, 'mysql')
    }
  }

  async listTables(database: string): Promise<TableInfo[]> {
    try {
      // SHOW FULL TABLES distinguishes BASE TABLE vs VIEW; the first column name
      // is dynamic ("Tables_in_<db>"), so read by position.
      const [rows] = await this.requirePool().query(`SHOW FULL TABLES IN ${quoteIdent(database)}`)
      return (rows as Array<Record<string, string>>).map((r) => {
        const values = Object.values(r)
        return { name: values[0] ?? '', type: tableType(values[1] ?? '') }
      })
    } catch (err) {
      throw translateError(err, 'mysql')
    }
  }

  async listColumns(database: string, table: string): Promise<ColumnInfo[]> {
    const qualified = `${quoteIdent(database)}.${quoteIdent(table)}`
    const pool = this.requirePool()
    try {
      const [colRows] = await pool.query(`SHOW FULL COLUMNS FROM ${qualified}`)
      // SHOW KEYS gives authoritative PK membership (Key_name = 'PRIMARY').
      const [keyRows] = await pool.query(`SHOW KEYS FROM ${qualified}`)
      const pkSet = new Set(
        (keyRows as Array<{ Key_name: string; Column_name: string }>)
          .filter((k) => k.Key_name === 'PRIMARY')
          .map((k) => k.Column_name),
      )
      // FK targets aren't exposed by SHOW — enrich from key_column_usage.
      const [fkRows] = await pool.query(
        `SELECT column_name, referenced_table_name, referenced_column_name
         FROM information_schema.key_column_usage
         WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
        [database, table],
      )
      const fkMap = new Map(
        (
          fkRows as Array<{
            column_name: string
            referenced_table_name: string
            referenced_column_name: string
          }>
        ).map((r) => [r.column_name, r]),
      )

      return (
        colRows as Array<{
          Field: string
          Type: string
          Null: string
          Default: string | null
        }>
      ).map((c) => {
        const fk = fkMap.get(c.Field)
        const isPrimaryKey = pkSet.has(c.Field)
        const isForeignKey = fk !== undefined
        return {
          name: c.Field,
          dataType: c.Type,
          nullable: c.Null === 'YES',
          defaultValue: c.Default ?? undefined,
          key: isPrimaryKey ? 'primary' : isForeignKey ? 'foreign' : null,
          isPrimaryKey,
          isForeignKey,
          foreignTable: fk?.referenced_table_name,
          foreignColumn: fk?.referenced_column_name,
        }
      })
    } catch (err) {
      throw translateError(err, 'mysql')
    }
  }

  async cancel(): Promise<void> {
    const threadId = this.currentThreadId
    if (threadId === null || !this.poolInstance) return
    try {
      // threadId is a driver-provided number — safe to interpolate.
      await this.requirePool().query(`KILL QUERY ${threadId}`)
    } catch {
      // Best-effort.
    }
  }

  private requirePool(): Pool {
    if (!this.poolInstance) throw new Error('Not connected.')
    return this.poolInstance
  }
}
