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

/** SQL engines that support an appended LIMIT clause. */
const SQL_ENGINES: ReadonlySet<DatabaseType> = new Set<DatabaseType>([
  'postgresql',
  'mysql',
  'sqlite',
])

/**
 * Enforce a row cap on bare SELECTs (TASKS.md Phase 2.5): if a SELECT has no
 * LIMIT, append one and return a notice for the Messages tab.
 */
function applyMaxRows(
  sql: string,
  type: DatabaseType,
  maxRows: number,
): { sql: string; notice?: string } {
  if (!SQL_ENGINES.has(type) || maxRows <= 0) return { sql }
  const trimmed = sql.trim().replace(/;\s*$/, '')
  const isSelect = /^\s*select\b/i.test(trimmed)
  const hasLimit = /\blimit\b/i.test(trimmed)
  if (!isSelect || hasLimit) return { sql }
  return {
    sql: `${trimmed} LIMIT ${maxRows}`,
    notice: `Results limited to ${maxRows} rows. Add an explicit LIMIT to override.`,
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

  async runQuery(connectionId: string, sql: string): Promise<QueryResult> {
    const managed = this.active.get(connectionId)
    if (!managed) throw new Error('Connection is not open.')

    const prefs = await getPreferences()
    const { sql: finalSql, notice } = applyMaxRows(sql, managed.config.type, prefs.maxRows)
    const timeoutMs = Math.max(1, prefs.queryTimeout) * 1000

    try {
      const result = await this.execWithTimeout(managed, finalSql, timeoutMs)
      return notice ? { ...result, notice } : result
    } catch (err) {
      // One silent reconnect-and-retry on a dropped connection.
      if (isConnectionDropped(err)) {
        await this.reconnect(connectionId)
        const retried = this.active.get(connectionId)
        if (retried) {
          const result = await this.execWithTimeout(retried, finalSql, timeoutMs)
          return notice ? { ...result, notice } : result
        }
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
