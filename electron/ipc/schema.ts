import { ipcMain } from 'electron'
import { IPC, ipcError, ipcSuccess } from '../../shared/ipc'
import type { DropTableTarget } from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'

function quoteIdent(type: string, name: string): string {
  if (type === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

/** Qualified DROP target + a human label for the success list / errors. */
function dropStatement(type: string, t: DropTableTarget, cascade: boolean): { sql: string; label: string } {
  const q = (s: string): string => quoteIdent(type, s)
  if (type === 'mysql') {
    const ref = `${q(t.database)}.${q(t.name)}`
    return { sql: `DROP TABLE IF EXISTS ${ref}`, label: ref }
  }
  if (type === 'sqlite') {
    return { sql: `DROP TABLE IF EXISTS ${q(t.name)}`, label: q(t.name) }
  }
  // PostgreSQL (and default)
  const ref = t.schema ? `${q(t.schema)}.${q(t.name)}` : q(t.name)
  return { sql: `DROP TABLE IF EXISTS ${ref} ${cascade ? 'CASCADE' : 'RESTRICT'}`, label: ref }
}

async function handleDropTables(
  connectionId: string,
  tables: DropTableTarget[],
  cascade: boolean,
): Promise<{ dropped: string[] }> {
  // Defense in depth — the UI already hides delete on production connections.
  if (connectionManager.isProduction(connectionId)) {
    throw new Error('Cannot delete tables on a production connection.')
  }
  const driver = connectionManager.getDriver(connectionId)
  const type = connectionManager.getConfig(connectionId).type
  const dropped: string[] = []

  if (cascade && type === 'mysql') await driver.query('SET FOREIGN_KEY_CHECKS = 0')
  if (cascade && type === 'sqlite') await driver.query('PRAGMA foreign_keys = OFF')

  await driver.query('BEGIN')
  try {
    for (const t of tables) {
      const { sql, label } = dropStatement(type, t, cascade)
      try {
        await driver.query(sql)
      } catch (err) {
        throw new Error(`Failed to drop ${label}: ${describeError(err)}`)
      }
      dropped.push(label)
    }
    await driver.query('COMMIT')
  } catch (err) {
    await driver.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    if (cascade && type === 'mysql') await driver.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined)
    if (cascade && type === 'sqlite') await driver.query('PRAGMA foreign_keys = ON').catch(() => undefined)
  }
  return { dropped }
}

export function registerSchemaHandlers(): void {
  ipcMain.handle(IPC.SCHEMA.LIST_DATABASES, async (_e, connectionId: string) => {
    try {
      return ipcSuccess(await connectionManager.getDriver(connectionId).listDatabases())
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(
    IPC.SCHEMA.LIST_TABLES,
    async (_e, connectionId: string, database: string) => {
      try {
        return ipcSuccess(await connectionManager.getDriver(connectionId).listTables(database))
      } catch (err) {
        return ipcError(describeError(err))
      }
    },
  )

  ipcMain.handle(
    IPC.SCHEMA.LIST_COLUMNS,
    async (_e, connectionId: string, database: string, table: string) => {
      try {
        return ipcSuccess(
          await connectionManager.getDriver(connectionId).listColumns(database, table),
        )
      } catch (err) {
        return ipcError(describeError(err))
      }
    },
  )

  ipcMain.handle(
    IPC.SCHEMA.DROP_TABLES,
    async (_e, connectionId: string, tables: DropTableTarget[], cascade: boolean) => {
      try {
        return ipcSuccess(await handleDropTables(connectionId, tables, cascade))
      } catch (err) {
        return ipcError(describeError(err))
      }
    },
  )
}
