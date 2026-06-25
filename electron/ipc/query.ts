import { ipcMain } from 'electron'
import { IPC, type QueryRequest, ipcError, ipcSuccess } from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'

export function registerQueryHandlers(): void {
  ipcMain.handle(IPC.QUERY.EXECUTE, async (_e, request: QueryRequest) => {
    try {
      return ipcSuccess(await connectionManager.runQuery(request.connectionId, request.sql))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.QUERY.CANCEL, async (_e, connectionId: string) => {
    try {
      await connectionManager.getDriver(connectionId).cancel()
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
