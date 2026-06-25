import { registerConnectionHandlers } from './connection'
import { registerQueryHandlers } from './query'
import { registerSchemaHandlers } from './schema'
import { registerConfigHandlers } from './config'
import { registerBackupHandlers } from './backup/backup'
import { registerDialogHandlers } from './dialog'

/**
 * Central IPC registration — called once from main.ts after the app is ready.
 * Each domain registers its own `ipcMain.handle(...)` channels; every handler
 * returns the `IpcResponse<T>` discriminated union (AGENTS.md).
 */
export function registerIpcHandlers(): void {
  registerConnectionHandlers()
  registerQueryHandlers()
  registerSchemaHandlers()
  registerConfigHandlers()
  registerBackupHandlers()
  registerDialogHandlers()
}
