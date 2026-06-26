import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_LAYOUT,
  DEFAULT_PREFERENCES,
  IPC,
  ipcError,
  ipcSuccess,
} from '../../shared/ipc'
import type {
  ConnectionConfig,
  ConnectionFolder,
  ConnectionWithPassword,
  FolderColor,
  FolderDeleteResult,
  FolderPatch,
  IpcResponse,
  LayoutConfig,
  NativeClientConfig,
  ReorderItem,
  SecretsBackend,
  UserPreferences,
} from '../../shared/ipc'
import { describeError } from './drivers/base'
import {
  deleteSecret,
  getSecret,
  getSecretsBackend,
  migrateKeychainPasswords,
  setSecret,
} from './secrets'

// Passwords → OS keychain (or AES-encrypted fallback). Metadata → flat JSON
// under ~/.tractodb/ (DBeaver-style).
const DIR = path.join(os.homedir(), '.tractodb')
const OLD_DIR = path.join(os.homedir(), '.dbstudio') // pre-rename; migration source only
const CONNECTIONS_FILE = path.join(DIR, 'connections.json')
const LAYOUT_FILE = path.join(DIR, 'layout.json')
const PREFERENCES_FILE = path.join(DIR, 'preferences.json')
const FOLDERS_FILE = path.join(DIR, 'folders.json')

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

function nowIso(): string {
  return new Date().toISOString()
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true, () => false)
}

/**
 * One-time rename migration (DBStudio → TractoDB). On first launch after the
 * rename, copy the old ~/.dbstudio/ directory to ~/.tractodb/ (left as a
 * backup, never deleted) and re-key any keychain passwords. Idempotent.
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    if ((await exists(OLD_DIR)) && !(await exists(DIR))) {
      await fs.mkdir(DIR, { recursive: true })
      for (const name of await fs.readdir(OLD_DIR)) {
        await fs.copyFile(path.join(OLD_DIR, name), path.join(DIR, name)).catch(() => {})
      }
      console.warn('Migrated config from ~/.dbstudio to ~/.tractodb')
    }
    const ids = (await loadConnections()).map((c) => c.id)
    if (ids.length) await migrateKeychainPasswords(ids)
  } catch {
    // Migration is best-effort — a fresh install (no old dir) is the common case.
  }
}

// ─── Password access (used by the connection manager) ──────────────────────────

export async function getStoredPassword(id: string): Promise<string | undefined> {
  try {
    // NOTE: never log the return value — it is a plaintext password.
    return await getSecret(id)
  } catch {
    // Storage unavailable. Proceed without a stored password — engines that
    // require one surface an auth error; password-less engines (SQLite) connect.
    return undefined
  }
}

export async function getPreferences(): Promise<UserPreferences> {
  return loadPreferences()
}

export async function getNativeClient(): Promise<NativeClientConfig> {
  return (await loadPreferences()).nativeClient ?? {}
}

export async function setNativeClient(nativeClient: NativeClientConfig): Promise<void> {
  const prefs = await loadPreferences()
  await writeJson(PREFERENCES_FILE, { ...prefs, nativeClient })
}

// ─── Connection metadata ────────────────────────────────────────────────────────

export async function loadConnections(): Promise<ConnectionConfig[]> {
  return readJson<ConnectionConfig[]>(CONNECTIONS_FILE, [])
}

async function saveConnection(input: ConnectionWithPassword): Promise<ConnectionConfig> {
  // Strip the password before it ever touches disk; it goes to the keychain only.
  const { password, ...rest } = input
  const config: ConnectionConfig = {
    ...rest,
    createdAt: rest.createdAt || nowIso(),
    updatedAt: nowIso(),
  }

  const list = await loadConnections()
  const index = list.findIndex((c) => c.id === config.id)
  if (index >= 0) list[index] = config
  else list.push(config)
  await writeJson(CONNECTIONS_FILE, list)

  if (password) {
    // Goes to the OS keychain, or an AES-encrypted file if keytar is unavailable.
    await setSecret(config.id, password)
  }
  return config
}

async function deleteConnection(id: string): Promise<void> {
  const list = (await loadConnections()).filter((c) => c.id !== id)
  await writeJson(CONNECTIONS_FILE, list)
  await deleteSecret(id)
}

// ─── Layout & preferences ────────────────────────────────────────────────────────

async function loadLayout(): Promise<LayoutConfig> {
  return { ...DEFAULT_LAYOUT, ...(await readJson<Partial<LayoutConfig>>(LAYOUT_FILE, {})) }
}

/** Merge a partial layout into the stored one — panel sizes and tab state are
 *  written by different stores, so a full overwrite would clobber the other. */
async function saveLayout(partial: Partial<LayoutConfig>): Promise<void> {
  const current = await loadLayout()
  await writeJson(LAYOUT_FILE, { ...current, ...partial })
}

async function loadPreferences(): Promise<UserPreferences> {
  return {
    ...DEFAULT_PREFERENCES,
    ...(await readJson<Partial<UserPreferences>>(PREFERENCES_FILE, {})),
  }
}

// ─── Connection folders ─────────────────────────────────────────────────────────

async function loadFolders(): Promise<ConnectionFolder[]> {
  const data = await readJson<{ folders: ConnectionFolder[] }>(FOLDERS_FILE, { folders: [] })
  return data.folders ?? []
}

async function saveFolders(folders: ConnectionFolder[]): Promise<void> {
  await writeJson(FOLDERS_FILE, { folders })
}

async function folderCreate(
  name: string,
  color: FolderColor,
  parentId: string | null,
): Promise<ConnectionFolder> {
  const folders = await loadFolders()
  if (parentId !== null) {
    const parent = folders.find((f) => f.id === parentId)
    if (!parent) throw new Error('Parent folder not found.')
    // Enforce max depth 2: a parent that itself has a parent cannot nest further.
    if (parent.parentId !== null) throw new Error('Maximum folder depth is 2')
  }
  const siblings = folders.filter((f) => f.parentId === parentId)
  const order = siblings.reduce((max, f) => Math.max(max, f.order), -1) + 1
  const folder: ConnectionFolder = {
    id: randomUUID(),
    name,
    color,
    collapsed: false,
    parentId,
    order,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await saveFolders([...folders, folder])
  return folder
}

async function folderUpdate(id: string, patch: FolderPatch): Promise<ConnectionFolder> {
  const folders = await loadFolders()
  const folder = folders.find((f) => f.id === id)
  if (!folder) throw new Error('Folder not found.')
  const updated: ConnectionFolder = { ...folder, ...patch, updatedAt: nowIso() }
  await saveFolders(folders.map((f) => (f.id === id ? updated : f)))
  return updated
}

async function folderDelete(id: string): Promise<FolderDeleteResult> {
  const folders = await loadFolders()
  const target = folders.find((f) => f.id === id)
  if (!target) throw new Error('Folder not found.')

  // Connections inside move up one level (to the deleted folder's parent).
  const connections = await loadConnections()
  const affectedConnectionIds: string[] = []
  const nextConnections = connections.map((c) => {
    if ((c.folderId ?? null) === id) {
      affectedConnectionIds.push(c.id)
      return { ...c, folderId: target.parentId, updatedAt: nowIso() }
    }
    return c
  })

  // Child folders: if the deleted folder was a root, its children become roots.
  const affectedFolderIds: string[] = []
  const remaining = folders
    .filter((f) => f.id !== id)
    .map((f) => {
      if (f.parentId === id) {
        affectedFolderIds.push(f.id)
        return { ...f, parentId: target.parentId, updatedAt: nowIso() }
      }
      return f
    })

  await saveFolders(remaining)
  if (affectedConnectionIds.length > 0) await writeJson(CONNECTIONS_FILE, nextConnections)
  return { deletedId: id, affectedConnectionIds, affectedFolderIds }
}

async function folderReorder(items: ReorderItem[]): Promise<void> {
  const folders = await loadFolders()
  const connections = await loadConnections()
  const folderUpdates = new Map(items.filter((i) => i.type === 'folder').map((i) => [i.id, i]))
  const connUpdates = new Map(items.filter((i) => i.type === 'connection').map((i) => [i.id, i]))

  const nextFolders = folders.map((f) => {
    const u = folderUpdates.get(f.id)
    return u ? { ...f, parentId: u.parentId, order: u.order, updatedAt: nowIso() } : f
  })
  const nextConnections = connections.map((c) => {
    const u = connUpdates.get(c.id)
    return u ? { ...c, folderId: u.parentId, order: u.order, updatedAt: nowIso() } : c
  })

  await saveFolders(nextFolders)
  if (connUpdates.size > 0) await writeJson(CONNECTIONS_FILE, nextConnections)
}

// ─── IPC registration ─────────────────────────────────────────────────────────

function handle<T>(
  channel: string,
  run: (event: IpcMainInvokeEvent, ...args: never[]) => Promise<T>,
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResponse<T>> => {
    try {
      return ipcSuccess(await run(event, ...(args as never[])))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}

export function registerConfigHandlers(): void {
  handle(IPC.CONFIG.SAVE_CONNECTION, (_e, connection: ConnectionWithPassword) =>
    saveConnection(connection),
  )
  handle(IPC.CONFIG.DELETE_CONNECTION, (_e, id: string) => deleteConnection(id))
  handle(IPC.CONFIG.LOAD_CONNECTIONS, () => loadConnections())
  handle(IPC.CONFIG.SAVE_LAYOUT, (_e, layout: Partial<LayoutConfig>) => saveLayout(layout))
  handle(IPC.CONFIG.LOAD_LAYOUT, () => loadLayout())
  handle(IPC.CONFIG.SAVE_PREFERENCES, (_e, prefs: UserPreferences) =>
    writeJson(PREFERENCES_FILE, prefs),
  )
  handle(IPC.CONFIG.LOAD_PREFERENCES, () => loadPreferences())
  handle<SecretsBackend>(IPC.CONFIG.SECRETS_BACKEND, () => getSecretsBackend())

  handle(IPC.FOLDER.CREATE, (_e, name: string, color: FolderColor, parentId: string | null) =>
    folderCreate(name, color, parentId),
  )
  handle(IPC.FOLDER.UPDATE, (_e, id: string, patch: FolderPatch) => folderUpdate(id, patch))
  handle(IPC.FOLDER.DELETE, (_e, id: string) => folderDelete(id))
  handle(IPC.FOLDER.LIST, () => loadFolders())
  handle(IPC.FOLDER.REORDER, (_e, items: ReorderItem[]) => folderReorder(items))
}
