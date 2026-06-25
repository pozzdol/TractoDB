/**
 * shared/ipc.ts
 * IPC channel names and payload types shared between main and renderer.
 * All IPC communication must use these types.
 */

// ─── Channel Names ────────────────────────────────────────────────────────────

export const IPC = {
  CONNECTION: {
    CONNECT: 'connection:connect',
    DISCONNECT: 'connection:disconnect',
    TEST: 'connection:test',
    LIST: 'connection:list',
  },
  QUERY: {
    EXECUTE: 'query:execute',
    CANCEL: 'query:cancel',
  },
  SCHEMA: {
    LIST_DATABASES: 'schema:listDatabases',
    LIST_TABLES: 'schema:listTables',
    LIST_COLUMNS: 'schema:listColumns',
  },
  CONFIG: {
    SAVE_CONNECTION: 'config:saveConnection',
    DELETE_CONNECTION: 'config:deleteConnection',
    LOAD_CONNECTIONS: 'config:loadConnections',
    SAVE_LAYOUT: 'config:saveLayout',
    LOAD_LAYOUT: 'config:loadLayout',
    SAVE_PREFERENCES: 'config:savePreferences',
    LOAD_PREFERENCES: 'config:loadPreferences',
    SECRETS_BACKEND: 'config:secretsBackend',
  },
  DIALOG: {
    OPEN: 'dialog:open',
    SAVE: 'dialog:save',
  },
  MENU: {
    /** Push channel (main → renderer): native menu item clicked. */
    ACTION: 'menu:action',
  },
  BACKUP: {
    START_BACKUP: 'backup:startBackup',
    START_RESTORE: 'backup:startRestore',
    CANCEL: 'backup:cancel',
    DETECT_CLIENT: 'backup:detectClient',
    SAVE_CLIENT: 'backup:saveClient',
    LOAD_CLIENT: 'backup:loadClient',
    /** Push channel (main → renderer): streams CLI output line-by-line. */
    PROGRESS: 'backup:progress',
  },
} as const

/** Where connection passwords are stored. */
export type SecretsBackend = 'keychain' | 'encrypted-file'

// ─── Database Types ───────────────────────────────────────────────────────────

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'redis'

// ─── Connection Config ────────────────────────────────────────────────────────

export interface ConnectionConfig {
  id: string
  name: string
  type: DatabaseType
  // TCP connections (PostgreSQL, MySQL, Redis)
  host?: string
  port?: number
  // Auth
  username?: string
  // Password stored in OS keychain — never in this object
  database?: string
  // SQLite only
  filePath?: string
  // TLS
  ssl?: boolean
  // Metadata
  createdAt: string
  updatedAt: string
  color?: string  // custom color for sidebar indicator
  group?: string  // folder/group name
}

export interface ConnectionWithPassword extends ConnectionConfig {
  password?: string  // only used transiently when saving/testing — never persisted in JSON
}

// ─── Connection State ─────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface ActiveConnection {
  id: string
  config: ConnectionConfig
  status: ConnectionStatus
  connectedAt?: string
  errorMessage?: string
  databaseVersion?: string
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface QueryRequest {
  connectionId: string
  sql: string
  database?: string
}

export interface QueryColumn {
  name: string
  dataType: string
  nullable?: boolean
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  sql: string
  /** Non-fatal notice surfaced in the Messages tab (e.g. result row cap). */
  notice?: string
}

export interface QueryHistoryEntry {
  id: string
  connectionId: string
  sql: string
  executedAt: string
  durationMs: number
  rowCount: number
  error?: string
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface DatabaseInfo {
  name: string
  owner?: string
  size?: string
  /** SQLite only — absolute path to the database file. */
  path?: string
}

export type TableType = 'table' | 'view' | 'materialized-view' | 'function'

export interface TableInfo {
  name: string
  type: TableType
  schema?: string
  rowCount?: number
}

export type ColumnKey = 'primary' | 'foreign' | 'unique' | null

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  defaultValue?: string
  key: ColumnKey
  isPrimaryKey: boolean
  isForeignKey: boolean
  foreignTable?: string
  foreignColumn?: string
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export type TabType = 'query-editor' | 'table-browser'

/** Serializable tab — persisted in layout.json and restored on reload. */
export interface PersistedTab {
  id: string
  type: TabType
  title: string
  connectionId: string | null
  sql?: string
  database?: string | null
  table?: string
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface LayoutConfig {
  sidebarWidth: number
  rightPanelWidth: number
  resultsPanelHeight: number
  sidebarCollapsed: boolean
  rightPanelCollapsed: boolean
  /** Open tabs to restore on reload. */
  openTabs?: PersistedTab[]
  activeTabId?: string | null
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  sidebarWidth: 220,
  rightPanelWidth: 200,
  resultsPanelHeight: 200,
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  openTabs: [],
  activeTabId: null,
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system'

export interface UserPreferences {
  theme: Theme
  fontSize: number
  fontFamily: string
  queryTimeout: number  // seconds
  maxRows: number
  autoComplete: boolean
  /** True once the user dismisses the "keychain unavailable" warning. */
  secretsWarningDismissed: boolean
  /** Native CLI client paths for backup/restore (Phase 2.6). */
  nativeClient?: NativeClientConfig
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  queryTimeout: 30,
  maxRows: 1000,
  autoComplete: true,
  secretsWarningDismissed: false,
}

// ─── Backup & Restore (Native Client) ─────────────────────────────────────────

export type BackupFormat = 'plain' | 'custom' | 'tar' | 'directory' // PostgreSQL
export type BackupCompression = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type BackupDatabaseType = 'postgresql' | 'mysql'

export interface BackupConfig {
  connectionId: string
  databaseType: BackupDatabaseType
  database: string
  schemas?: string[] // PostgreSQL only; empty = all
  tables?: string[] // empty = all
  outputPath: string // file or directory path
  format?: BackupFormat // PostgreSQL only
  compression?: BackupCompression
  noOwner?: boolean // pg_dump --no-owner
  noPrivileges?: boolean // pg_dump --no-privileges
  ifExists?: boolean // pg_dump --if-exists
  // MySQL toggles
  singleTransaction?: boolean
  routines?: boolean
  triggers?: boolean
  dataOnly?: boolean
  schemaOnly?: boolean
  extraArgs?: string // raw extra CLI flags (like DBeaver's "Extra command args")
}

export interface RestoreConfig {
  connectionId: string
  databaseType: BackupDatabaseType
  database: string
  inputPath: string // path to .sql / .dump / .tar file
  clean?: boolean // pg_restore --clean (drop before recreate)
  ifExists?: boolean
  noOwner?: boolean
  noPrivileges?: boolean
  extraArgs?: string
}

export interface NativeClientConfig {
  postgresql?: string // path to pg_dump binary dir e.g. /usr/lib/postgresql/16/bin
  mysql?: string // path to mysqldump binary dir e.g. /usr/bin
}

export interface DetectedClient {
  found: boolean
  path?: string
  version?: string
}

export interface ClientDetection {
  postgresql: DetectedClient
  mysql: DetectedClient
}

export interface BackupProgress {
  line: string // stdout/stderr line
  isError: boolean
  isDone: boolean
  exitCode?: number
}

// ─── Native file dialogs ──────────────────────────────────────────────────────

export interface DialogFilter {
  name: string
  extensions: string[]
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
  /** Pick a directory instead of a file. */
  directory?: boolean
}

// ─── IPC Response Wrapper ─────────────────────────────────────────────────────

export type IpcSuccess<T> = { success: true; data: T }
export type IpcError = { success: false; error: string; code?: string }
export type IpcResponse<T> = IpcSuccess<T> | IpcError

export function ipcSuccess<T>(data: T): IpcSuccess<T> {
  return { success: true, data }
}

export function ipcError(error: string, code?: string): IpcError {
  return { success: false, error, code }
}

// ─── Renderer-facing API (window.dbstudio) ─────────────────────────────────────
//
// This is the ONLY surface the renderer may touch — it never calls ipcRenderer
// or Node APIs directly (see AGENTS.md). preload.ts implements this interface by
// forwarding each method to `ipcRenderer.invoke(<channel>, ...args)`; main-process
// handlers (registered in electron/ipc/) resolve them with an IpcResponse.

export interface DbStudioApi {
  connection: {
    connect(config: ConnectionConfig): Promise<IpcResponse<ActiveConnection>>
    disconnect(id: string): Promise<IpcResponse<void>>
    test(config: ConnectionWithPassword): Promise<IpcResponse<boolean>>
    list(): Promise<IpcResponse<ActiveConnection[]>>
  }
  query: {
    execute(
      connectionId: string,
      sql: string,
      database?: string,
    ): Promise<IpcResponse<QueryResult>>
    cancel(connectionId: string): Promise<IpcResponse<void>>
  }
  schema: {
    listDatabases(connectionId: string): Promise<IpcResponse<DatabaseInfo[]>>
    listTables(connectionId: string, database: string): Promise<IpcResponse<TableInfo[]>>
    listColumns(
      connectionId: string,
      database: string,
      table: string,
    ): Promise<IpcResponse<ColumnInfo[]>>
  }
  config: {
    saveConnection(connection: ConnectionWithPassword): Promise<IpcResponse<ConnectionConfig>>
    deleteConnection(id: string): Promise<IpcResponse<void>>
    loadConnections(): Promise<IpcResponse<ConnectionConfig[]>>
    saveLayout(layout: Partial<LayoutConfig>): Promise<IpcResponse<void>>
    loadLayout(): Promise<IpcResponse<LayoutConfig>>
    savePreferences(preferences: UserPreferences): Promise<IpcResponse<void>>
    loadPreferences(): Promise<IpcResponse<UserPreferences>>
    secretsBackend(): Promise<IpcResponse<SecretsBackend>>
  }
  backup: {
    startBackup(config: BackupConfig): Promise<IpcResponse<void>>
    startRestore(config: RestoreConfig): Promise<IpcResponse<void>>
    cancel(): Promise<IpcResponse<void>>
    detectClient(): Promise<IpcResponse<ClientDetection>>
    saveClient(config: NativeClientConfig): Promise<IpcResponse<void>>
    loadClient(): Promise<IpcResponse<NativeClientConfig>>
    /** Subscribe to streamed CLI output. Returns an unsubscribe function. */
    onProgress(callback: (progress: BackupProgress) => void): () => void
  }
  dialog: {
    /** Returns the chosen path, or null if cancelled. */
    open(options?: OpenDialogOptions): Promise<IpcResponse<string | null>>
    save(options?: SaveDialogOptions): Promise<IpcResponse<string | null>>
  }
  menu: {
    /** Subscribe to native-menu actions. Returns an unsubscribe function. */
    onAction(callback: (action: MenuAction) => void): () => void
  }
}

/** Actions emitted by the native application menu. */
export type MenuAction = 'backup' | 'restore'

declare global {
  interface Window {
    dbstudio: DbStudioApi
  }
}
