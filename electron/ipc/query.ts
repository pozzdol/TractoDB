import { ipcMain } from 'electron'
import { IPC, type QueryRequest, ipcError, ipcSuccess } from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'

export function registerQueryHandlers(): void {
  ipcMain.handle(IPC.QUERY.EXECUTE, async (_e, request: QueryRequest) => {
    try {
      return ipcSuccess(
        await connectionManager.runQuery(request.connectionId, request.sql, {
          offset: request.offset,
          limit: request.limit,
        }),
      )
    } catch (err) {
      const msg = describeError(err)
      // Sort on an unorderable type (JSONB / incompatible collation). (BUG 11 Part C)
      const code = /could not identify an ordering operator|Illegal mix of collations/i.test(msg)
        ? 'SORT_NOT_SUPPORTED'
        : undefined
      return ipcError(msg, code)
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
