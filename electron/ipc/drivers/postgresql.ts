import { Pool } from 'pg'
import type { PoolClient, PoolConfig } from 'pg'
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

/** Common pg type OIDs → readable names (full catalog lookup is overkill for V1). */
const OID_TYPE: Record<number, string> = {
  16: 'bool',
  17: 'bytea',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  114: 'json',
  700: 'float4',
  701: 'float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1184: 'timestamptz',
  1700: 'numeric',
  2950: 'uuid',
  3802: 'jsonb',
}

function pgTypeName(oid: number): string {
  return OID_TYPE[oid] ?? `oid:${oid}`
}

function tableType(raw: string): TableType {
  switch (raw) {
    case 'VIEW':
      return 'view'
    case 'MATERIALIZED VIEW':
      return 'materialized-view'
    default:
      return 'table'
  }
}

export class PostgresDriver implements DatabaseDriver {
  private poolInstance: Pool | null = null
  private readonly config: DriverConfig
  /** Backend PID of the in-flight query (for cancellation). */
  private currentPid: number | null = null

  constructor(config: DriverConfig) {
    this.config = config
  }

  private poolConfig(): PoolConfig {
    return {
      host: this.config.host,
      port: this.config.port ?? 5432,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      // V1: permissive TLS so self-signed VPS certs work. Tighten in a later phase.
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      max: POOL_MAX,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    }
  }

  async connect(): Promise<void> {
    const pool = new Pool(this.poolConfig())
    // A pool is lazy — force one real connection so connect() fails fast on a
    // bad host/credentials instead of on the first query.
    try {
      const client = await withTimeout(
        pool.connect(),
        CONNECT_TIMEOUT_MS,
        'Connection timed out — check host, port, and firewall.',
      )
      client.release()
      this.poolInstance = pool
    } catch (err) {
      await pool.end().catch(() => undefined)
      throw translateError(err, 'postgresql')
    }
  }

  async disconnect(): Promise<void> {
    const pool = this.poolInstance
    this.poolInstance = null
    this.currentPid = null
    if (pool) await pool.end().catch(() => undefined)
  }

  async testConnection(): Promise<boolean> {
    const pool = new Pool({ ...this.poolConfig(), max: 1 })
    try {
      await withTimeout(pool.query('SELECT 1'), CONNECT_TIMEOUT_MS, 'Connection test timed out.')
      return true
    } catch (err) {
      throw translateError(err, 'postgresql')
    } finally {
      await pool.end().catch(() => undefined)
    }
  }

  async getServerVersion(): Promise<string> {
    try {
      const res = await this.requirePool().query<{ version: string }>('SELECT version()')
      const raw = res.rows[0]?.version ?? ''
      const match = /PostgreSQL ([\d.]+)/.exec(raw)
      return match ? `PostgreSQL ${match[1]}` : 'PostgreSQL (unknown version)'
    } catch (err) {
      throw translateError(err, 'postgresql')
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
    let client: PoolClient
    try {
      client = await this.requirePool().connect()
    } catch (err) {
      throw translateError(err, 'postgresql')
    }
    try {
      const pid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      this.currentPid = pid.rows[0]?.pid ?? null
      const result = await client.query(sql)
      const fields = result.fields ?? []
      const columns: QueryColumn[] = fields.map((f) => ({
        name: f.name,
        dataType: pgTypeName(f.dataTypeID),
      }))
      const rows = (result.rows ?? []) as Record<string, unknown>[]
      return {
        columns,
        rows,
        rowCount: result.rowCount ?? rows.length,
        durationMs: nowMs() - started,
        sql,
      }
    } catch (err) {
      throw translateError(err, 'postgresql')
    } finally {
      this.currentPid = null
      client.release()
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    // Single-database mode: don't enumerate the server, just the configured db.
    if (this.config.databaseMode === 'single' && this.config.database) {
      return [{ name: this.config.database }]
    }
    try {
      const res = await this.requirePool().query<{ name: string; owner: string; size: string }>(
        `SELECT d.datname AS name,
                pg_catalog.pg_get_userbyid(d.datdba) AS owner,
                pg_size_pretty(pg_database_size(d.datname)) AS size
         FROM pg_database d
         WHERE d.datistemplate = false
         ORDER BY d.datname`,
      )
      return res.rows.map((r) => ({ name: r.name, owner: r.owner, size: r.size }))
    } catch (err) {
      throw translateError(err, 'postgresql')
    }
  }

  async listTables(_database: string): Promise<TableInfo[]> {
    try {
      const res = await this.requirePool().query<{
        name: string
        schema: string
        table_type: string
      }>(
        `SELECT table_name AS name, table_schema AS schema, table_type
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         UNION ALL
         SELECT matviewname AS name, schemaname AS schema, 'MATERIALIZED VIEW' AS table_type
         FROM pg_matviews
         ORDER BY schema, name`,
      )
      return res.rows.map((r) => ({
        name: r.name,
        schema: r.schema,
        type: tableType(r.table_type),
      }))
    } catch (err) {
      throw translateError(err, 'postgresql')
    }
  }

  async listColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    const [schema, tableName] = table.includes('.')
      ? (table.split('.', 2) as [string, string])
      : ['public', table]
    try {
      // Detect PK/FK directly from pg_constraint (TASKS.md Phase 2.5).
      const res = await this.requirePool().query<{
        name: string
        data_type: string
        nullable: boolean
        default_value: string | null
        is_pk: boolean
        foreign_table: string | null
        foreign_column: string | null
      }>(
        `SELECT a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS data_type,
                NOT a.attnotnull AS nullable,
                pg_get_expr(ad.adbin, ad.adrelid) AS default_value,
                COALESCE(pk.is_pk, false) AS is_pk,
                fk.ref_table AS foreign_table,
                fk.ref_column AS foreign_column
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
         LEFT JOIN LATERAL (
           SELECT true AS is_pk
           FROM pg_constraint con
           WHERE con.conrelid = c.oid AND con.contype = 'p' AND a.attnum = ANY(con.conkey)
           LIMIT 1
         ) pk ON true
         LEFT JOIN LATERAL (
           SELECT cf.relname AS ref_table, af.attname AS ref_column
           FROM pg_constraint con
           JOIN pg_class cf ON cf.oid = con.confrelid
           JOIN pg_attribute af
             ON af.attrelid = con.confrelid
            AND af.attnum = con.confkey[array_position(con.conkey, a.attnum)]
           WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)
           LIMIT 1
         ) fk ON true
         WHERE c.relname = $2 AND n.nspname = $1
           AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [schema, tableName],
      )
      return res.rows.map((c) => {
        const isForeignKey = c.foreign_table !== null
        return {
          name: c.name,
          dataType: c.data_type,
          nullable: c.nullable,
          defaultValue: c.default_value ?? undefined,
          key: c.is_pk ? 'primary' : isForeignKey ? 'foreign' : null,
          isPrimaryKey: c.is_pk,
          isForeignKey,
          foreignTable: c.foreign_table ?? undefined,
          foreignColumn: c.foreign_column ?? undefined,
        }
      })
    } catch (err) {
      throw translateError(err, 'postgresql')
    }
  }

  async cancel(): Promise<void> {
    const pid = this.currentPid
    if (pid === null || !this.poolInstance) return
    try {
      // Cancellation runs on a separate pooled connection — the one running the
      // query is busy.
      await this.requirePool().query('SELECT pg_cancel_backend($1)', [pid])
    } catch {
      // Best-effort: the query may have already finished.
    }
  }

  private requirePool(): Pool {
    if (!this.poolInstance) throw new Error('Not connected.')
    return this.poolInstance
  }
}
