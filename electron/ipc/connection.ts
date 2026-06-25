import { ipcMain } from 'electron'
import {
  IPC,
  type ActiveConnection,
  type ConnectionConfig,
  type ConnectionStatus,
  type ConnectionWithPassword,
  type DatabaseType,
  type QueryResult,
  ipcError,
  ipcSuccess,
} from '../../shared/ipc'
import { type DatabaseDriver, describeError } from './drivers/base'
import { isConnectionDropped } from './drivers/errors'
import { createDriver } from './drivers/registry'
import { getPreferences, getStoredPassword } from './config'

interface ManagedConnection {
  config: ConnectionConfig
  driver: DatabaseDriver
  status: ConnectionStatus
  connectedAt?: string
  databaseVersion?: string
}

/** SQL engines that support LIMIT/OFFSET pagination. */
const SQL_ENGINES: ReadonlySet<DatabaseType> = new Set<DatabaseType>([
  'postgresql',
  'mysql',
  'sqlite',
])

export interface QueryOptions {
  offset?: number
  limit?: number
}

const WRITE_STATEMENTS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'REPLACE',
]
const PROD_READONLY =
  'Blocked: this is a production connection. Only SELECT and read-only statements are allowed.'

/** Throw if `sql` contains any write statement (production read-only guard). */
function assertReadOnlySql(sql: string): void {
  for (const statement of sql.split(';')) {
    const first = statement
      .replace(/^\s*(--[^\n]*\n)*/g, '') // skip leading line comments
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase()
    if (first && WRITE_STATEMENTS.includes(first)) throw new Error(PROD_READONLY)
  }
}

/**
 * Owns the lifecycle of every open connection. query.ts and schema.ts borrow
 * drivers from here via `getDriver`; query execution goes through `runQuery`,
 * which applies the row cap, query timeout, and one silent reconnect-and-retry.
 */
class ConnectionManager {
  private readonly active = new Map<string, ManagedConnection>()

  async connect(config: ConnectionConfig): Promise<ActiveConnection> {
    await this.disconnect(config.id)

    const password = await getStoredPassword(config.id)
    const driver = createDriver({ ...config, password })
    await driver.connect()

    let databaseVersion: string | undefined
    try {
      databaseVersion = await driver.getServerVersion()
    } catch {
      // Version is informational only.
    }

    const managed: ManagedConnection = {
      config,
      driver,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      databaseVersion,
    }
    this.active.set(config.id, managed)
    return toActiveConnection(managed)
  }

  async disconnect(id: string): Promise<void> {
    const managed = this.active.get(id)
    if (!managed) return
    this.active.delete(id)
    await managed.driver.disconnect()
  }

  async test(config: ConnectionWithPassword): Promise<boolean> {
    const driver = createDriver(config)
    return driver.testConnection()
  }

  list(): ActiveConnection[] {
    return [...this.active.values()].map(toActiveConnection)
  }

  getDriver(id: string): DatabaseDriver {
    const managed = this.active.get(id)
    if (!managed) throw new Error('Connection is not open.')
    return managed.driver
  }

  getConfig(id: string): ConnectionConfig {
    const managed = this.active.get(id)
    if (!managed) throw new Error('Connection is not open.')
    return managed.config
  }

  isProduction(id: string): boolean {
    return this.active.get(id)?.config.environment === 'production'
  }

  async runQuery(
    connectionId: string,
    sql: string,
    options: QueryOptions = {},
  ): Promise<QueryResult> {
    const managed = this.active.get(connectionId)
    if (!managed) throw new Error('Connection is not open.')

    if (managed.config.environment === 'production') assertReadOnlySql(sql)

    const prefs = await getPreferences()
    const timeoutMs = Math.max(1, prefs.queryTimeout) * 1000

    // Pagination: append LIMIT/OFFSET to a bare SELECT when a page size is given.
    const { offset = 0, limit } = options
    const base = sql.trim().replace(/;\s*$/, '')
    const isSelect = /^\s*(select|with)\b/i.test(base)
    const hasLimit = /\blimit\b/i.test(base)
    const canPaginate =
      limit !== undefined && SQL_ENGINES.has(managed.config.type) && isSelect && !hasLimit
    const execSql = canPaginate ? `${base} LIMIT ${limit} OFFSET ${offset}` : sql

    const result = await this.execWithRetry(connectionId, execSql, timeoutMs)

    if (!canPaginate) return result

    // Total row count (best-effort) so the UI can show "N of M" + hasMore.
    let totalCount: number | undefined
    try {
      const countRes = await managed.driver.query(`SELECT COUNT(*) AS c FROM (${base}) AS _dbs_c`)
      const c = Number(countRes.rows[0]?.c)
      if (Number.isFinite(c)) totalCount = c
    } catch {
      totalCount = undefined
    }
    const hasMore =
      totalCount !== undefined ? offset + result.rowCount < totalCount : result.rowCount === limit
    return { ...result, totalCount, hasMore }
  }

  private async execWithRetry(
    connectionId: string,
    sql: string,
    timeoutMs: number,
  ): Promise<QueryResult> {
    const managed = this.active.get(connectionId)
    if (!managed) throw new Error('Connection is not open.')
    try {
      return await this.execWithTimeout(managed, sql, timeoutMs)
    } catch (err) {
      // One silent reconnect-and-retry on a dropped connection.
      if (isConnectionDropped(err)) {
        await this.reconnect(connectionId)
        const retried = this.active.get(connectionId)
        if (retried) return this.execWithTimeout(retried, sql, timeoutMs)
      }
      throw err
    }
  }

  private async execWithTimeout(
    managed: ManagedConnection,
    sql: string,
    timeoutMs: number,
  ): Promise<QueryResult> {
    return new Promise<QueryResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        void managed.driver.cancel()
        reject(new Error(`Query timed out after ${Math.round(timeoutMs / 1000)}s.`))
      }, timeoutMs)
      managed.driver.query(sql).then(
        (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        (err: unknown) => {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(String(err)))
        },
      )
    })
  }

  private async reconnect(id: string): Promise<void> {
    const managed = this.active.get(id)
    if (!managed) return
    await managed.driver.disconnect().catch(() => undefined)
    const password = await getStoredPassword(id)
    const driver = createDriver({ ...managed.config, password })
    await driver.connect()
    managed.driver = driver
    managed.status = 'connected'
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.disconnect(id)))
  }
}

function toActiveConnection(m: ManagedConnection): ActiveConnection {
  return {
    id: m.config.id,
    config: m.config,
    status: m.status,
    connectedAt: m.connectedAt,
    databaseVersion: m.databaseVersion,
  }
}

export const connectionManager = new ConnectionManager()

export function registerConnectionHandlers(): void {
  ipcMain.handle(IPC.CONNECTION.CONNECT, async (_e, config: ConnectionConfig) => {
    try {
      return ipcSuccess(await connectionManager.connect(config))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.CONNECTION.DISCONNECT, async (_e, id: string) => {
    try {
      await connectionManager.disconnect(id)
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.CONNECTION.TEST, async (_e, config: ConnectionWithPassword) => {
    try {
      return ipcSuccess(await connectionManager.test(config))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.CONNECTION.LIST, () => {
    try {
      return ipcSuccess(connectionManager.list())
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
