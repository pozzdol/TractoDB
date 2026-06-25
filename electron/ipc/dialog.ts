import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IPC,
  type OpenDialogOptions,
  type SaveDialogOptions,
  ipcError,
  ipcSuccess,
} from '../../shared/ipc'
import { describeError } from './drivers/base'

export function registerDialogHandlers(): void {
  ipcMain.handle(IPC.DIALOG.OPEN, async (_e, options: OpenDialogOptions = {}) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const opts = {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties: [options.directory ? ('openDirectory' as const) : ('openFile' as const)],
      }
      const result = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
      return ipcSuccess(result.canceled ? null : (result.filePaths[0] ?? null))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.DIALOG.SAVE, async (_e, options: SaveDialogOptions = {}) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const opts = {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      }
      const result = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts))
      return ipcSuccess(result.canceled ? null : (result.filePath ?? null))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
