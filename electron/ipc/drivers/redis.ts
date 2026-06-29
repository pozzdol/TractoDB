import { Redis } from 'ioredis'
import type { ColumnInfo, DatabaseInfo, QueryResult, TableInfo } from '../../../shared/ipc'
import { type DatabaseDriver, type DriverConfig, nowMs, withTimeout } from './base'
import { translateError } from './errors'

const CONNECT_TIMEOUT_MS = 10_000
const SCAN_COUNT = 100
// TASKS.md Phase 2.5: sample at most 500 keys so we never block the server.
const MAX_KEYS_SAMPLED = 500
const DEFAULT_DB_COUNT = 16

/**
 * Redis is key/value, not table-based (TASKS.md Phase 2.5). The schema tree maps:
 *   db<N>  →  key-prefix group (text before the first ':')  →  value structure
 * The query editor runs raw Redis commands rather than SQL.
 */
export class RedisDriver implements DatabaseDriver {
  private client: Redis | null = null
  private readonly config: DriverConfig

  constructor(config: DriverConfig) {
    this.config = config
  }

  private dbIndex(database?: string): number {
    if (!database) return Number(this.config.database) || 0
    const match = /^db(\d+)$/.exec(database)
    return match ? Number(match[1]) : Number(database) || 0
  }

  private newClient(): Redis {
    return new Redis({
      host: this.config.host ?? '127.0.0.1',
      port: this.config.port ?? 6379,
      password: this.config.password,
      db: this.dbIndex(),
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
  }

  async connect(): Promise<void> {
    const client = this.newClient()
    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Connection timed out.')
      this.client = client
    } catch (err) {
      client.disconnect()
      throw translateError(err, 'redis')
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client
    this.client = null
    if (client) await client.quit().catch(() => client.disconnect())
  }

  async testConnection(): Promise<boolean> {
    const client = this.newClient()
    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Connection test timed out.')
      return (await client.ping()) === 'PONG'
    } catch (err) {
      throw translateError(err, 'redis')
    } finally {
      client.disconnect()
    }
  }

  async getServerVersion(): Promise<string> {
    try {
      const info = await this.require().info('server')
      const match = /redis_version:([^\r\n]+)/.exec(info)
      return `Redis ${match?.[1] ?? 'unknown'}`
    } catch (err) {
      throw translateError(err, 'redis')
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.require().ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async query(sql: string): Promise<QueryResult> {
    const client = this.require()
    const started = nowMs()
    const parts = parseCommand(sql)
    if (parts.length === 0) {
      return { columns: [], rows: [], rowCount: 0, durationMs: nowMs() - started, sql }
    }
    const [command, ...args] = parts
    try {
      const reply: unknown = await client.call(command as string, ...args)
      return { ...toResult(reply), durationMs: nowMs() - started, sql }
    } catch (err) {
      throw translateError(err, 'redis')
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    try {
      let count = DEFAULT_DB_COUNT
      try {
        const cfg = await this.require().config('GET', 'databases')
        const parsed = Number((cfg as string[])[1])
        if (Number.isFinite(parsed) && parsed > 0) count = parsed
      } catch {
        // Some managed Redis instances disable CONFIG GET — fall back to 16.
      }
      return Array.from({ length: count }, (_v, i) => ({ name: `db${i}` }))
    } catch (err) {
      throw translateError(err, 'redis')
    }
  }

  async listTables(database: string): Promise<TableInfo[]> {
    try {
      const keys = await this.scanKeys(database, '*', MAX_KEYS_SAMPLED)
      const counts = new Map<string, number>()
      for (const key of keys) {
        const group = key.includes(':') ? key.slice(0, key.indexOf(':')) : key
        counts.set(group, (counts.get(group) ?? 0) + 1)
      }
      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, rowCount]) => ({ name, type: 'table' as const, rowCount }))
    } catch (err) {
      throw translateError(err, 'redis')
    }
  }

  async listColumns(database: string, table: string): Promise<ColumnInfo[]> {
    try {
      const client = this.require()
      const index = this.dbIndex(database)
      await client.select(index)
      try {
        // Find one representative key in the group and describe its structure.
        const sample = (await this.scanKeys(database, `${table}:*`, 1))[0] ?? table
        const type = await client.type(sample)
        return await this.describeStructure(client, sample, type)
      } finally {
        await client.select(this.dbIndex())
      }
    } catch (err) {
      throw translateError(err, 'redis')
    }
  }

  async cancel(): Promise<void> {
    // Redis commands return quickly; there's nothing meaningful to cancel in V1.
  }

  /** Map a representative key's Redis type to pseudo-columns (TASKS.md Phase 2.5). */
  private async describeStructure(
    client: Redis,
    key: string,
    type: string,
  ): Promise<ColumnInfo[]> {
    const col = (name: string, dataType: string): ColumnInfo => ({
      name,
      dataType,
      nullable: false,
      key: null,
      isPrimaryKey: false,
      isForeignKey: false,
    })
    switch (type) {
      case 'hash': {
        const fields = await client.hkeys(key)
        return fields.map((f) => col(f, 'hash field'))
      }
      case 'list':
        return [col('index', 'list')]
      case 'set':
        return [col('member', 'set')]
      case 'zset':
        return [col('member+score', 'sorted set')]
      case 'none':
        return []
      default:
        return [col('value', 'string')]
    }
  }

  /** SCAN a database for keys matching a pattern, bounded by `limit`. */
  private async scanKeys(database: string, pattern: string, limit: number): Promise<string[]> {
    const client = this.require()
    const index = this.dbIndex(database)
    await client.select(index)
    try {
      const keys: string[] = []
      let cursor = '0'
      do {
        const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT)
        cursor = next
        keys.push(...batch)
      } while (cursor !== '0' && keys.length < limit)
      return keys.slice(0, limit)
    } finally {
      await client.select(this.dbIndex())
    }
  }

  private require(): Redis {
    if (!this.client) throw new Error('Not connected.')
    return this.client
  }
}

/** Split a Redis command line into tokens, respecting single/double quotes. */
function parseCommand(input: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return tokens
}

/** Coerce a buffer/array/scalar Redis reply into the tabular QueryResult shape. */
function toResult(reply: unknown): Pick<QueryResult, 'columns' | 'rows' | 'rowCount'> {
  if (Array.isArray(reply)) {
    const rows = reply.map((value, i) => ({ '#': i + 1, value: stringify(value) }))
    return {
      columns: [
        { name: '#', displayName: '#', dataType: 'index' },
        { name: 'value', displayName: 'value', dataType: 'string' },
      ],
      rows,
      rowCount: rows.length,
    }
  }
  return {
    columns: [{ name: 'value', displayName: 'value', dataType: 'string' }],
    rows: [{ value: stringify(reply) }],
    rowCount: 1,
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
