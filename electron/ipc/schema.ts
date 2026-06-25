import { ipcMain } from 'electron'
import { IPC, ipcError, ipcSuccess } from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'

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
}
