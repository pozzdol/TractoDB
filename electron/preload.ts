import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { BackupProgress, DbStudioApi, MenuAction } from '../shared/ipc'

/**
 * The contextBridge surface. The renderer reaches the main process ONLY through
 * `window.tractodb.*` — never `ipcRenderer` or Node APIs directly. Each method
 * forwards to `ipcRenderer.invoke` and resolves with an `IpcResponse<T>`.
 */
const api: DbStudioApi = {
  connection: {
    connect: (config) => ipcRenderer.invoke(IPC.CONNECTION.CONNECT, config),
    disconnect: (id) => ipcRenderer.invoke(IPC.CONNECTION.DISCONNECT, id),
    test: (config) => ipcRenderer.invoke(IPC.CONNECTION.TEST, config),
    list: () => ipcRenderer.invoke(IPC.CONNECTION.LIST),
  },
  query: {
    execute: (connectionId, sql, database, offset, limit) =>
      ipcRenderer.invoke(IPC.QUERY.EXECUTE, { connectionId, sql, database, offset, limit }),
    cancel: (connectionId) => ipcRenderer.invoke(IPC.QUERY.CANCEL, connectionId),
  },
  schema: {
    listDatabases: (connectionId) =>
      ipcRenderer.invoke(IPC.SCHEMA.LIST_DATABASES, connectionId),
    listTables: (connectionId, database) =>
      ipcRenderer.invoke(IPC.SCHEMA.LIST_TABLES, connectionId, database),
    listColumns: (connectionId, database, table) =>
      ipcRenderer.invoke(IPC.SCHEMA.LIST_COLUMNS, connectionId, database, table),
    getTableDDL: (ref) => ipcRenderer.invoke(IPC.SCHEMA.GET_TABLE_DDL, ref),
    getTableInfo: (ref) => ipcRenderer.invoke(IPC.SCHEMA.GET_TABLE_INFO, ref),
    getIndexes: (ref) => ipcRenderer.invoke(IPC.SCHEMA.GET_INDEXES, ref),
    getForeignKeys: (ref) => ipcRenderer.invoke(IPC.SCHEMA.GET_FOREIGN_KEYS, ref),
  },
  table: {
    updateCell: (request) => ipcRenderer.invoke(IPC.TABLE.UPDATE_CELL, request),
    alterColumn: (request) => ipcRenderer.invoke(IPC.TABLE.ALTER_COLUMN, request),
  },
  config: {
    saveConnection: (connection) =>
      ipcRenderer.invoke(IPC.CONFIG.SAVE_CONNECTION, connection),
    deleteConnection: (id) => ipcRenderer.invoke(IPC.CONFIG.DELETE_CONNECTION, id),
    loadConnections: () => ipcRenderer.invoke(IPC.CONFIG.LOAD_CONNECTIONS),
    saveLayout: (layout) => ipcRenderer.invoke(IPC.CONFIG.SAVE_LAYOUT, layout),
    loadLayout: () => ipcRenderer.invoke(IPC.CONFIG.LOAD_LAYOUT),
    savePreferences: (preferences) =>
      ipcRenderer.invoke(IPC.CONFIG.SAVE_PREFERENCES, preferences),
    loadPreferences: () => ipcRenderer.invoke(IPC.CONFIG.LOAD_PREFERENCES),
    secretsBackend: () => ipcRenderer.invoke(IPC.CONFIG.SECRETS_BACKEND),
  },
  folder: {
    create: (name, color, parentId) => ipcRenderer.invoke(IPC.FOLDER.CREATE, name, color, parentId),
    update: (id, patch) => ipcRenderer.invoke(IPC.FOLDER.UPDATE, id, patch),
    delete: (id) => ipcRenderer.invoke(IPC.FOLDER.DELETE, id),
    list: () => ipcRenderer.invoke(IPC.FOLDER.LIST),
    reorder: (items) => ipcRenderer.invoke(IPC.FOLDER.REORDER, items),
  },
  backup: {
    startBackup: (config) => ipcRenderer.invoke(IPC.BACKUP.START_BACKUP, config),
    startRestore: (config) => ipcRenderer.invoke(IPC.BACKUP.START_RESTORE, config),
    cancel: () => ipcRenderer.invoke(IPC.BACKUP.CANCEL),
    detectClient: () => ipcRenderer.invoke(IPC.BACKUP.DETECT_CLIENT),
    saveClient: (config) => ipcRenderer.invoke(IPC.BACKUP.SAVE_CLIENT, config),
    loadClient: () => ipcRenderer.invoke(IPC.BACKUP.LOAD_CLIENT),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, data: BackupProgress): void =>
        callback(data)
      ipcRenderer.on(IPC.BACKUP.PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC.BACKUP.PROGRESS, listener)
    },
  },
  dialog: {
    open: (options) => ipcRenderer.invoke(IPC.DIALOG.OPEN, options),
    save: (options) => ipcRenderer.invoke(IPC.DIALOG.SAVE, options),
  },
  menu: {
    onAction: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void =>
        callback(action)
      ipcRenderer.on(IPC.MENU.ACTION, listener)
      return () => ipcRenderer.removeListener(IPC.MENU.ACTION, listener)
    },
  },
}

contextBridge.exposeInMainWorld('tractodb', api)
