import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
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
  ConnectionWithPassword,
  IpcResponse,
  LayoutConfig,
  NativeClientConfig,
  SecretsBackend,
  UserPreferences,
} from '../../shared/ipc'
import { describeError } from './drivers/base'
import { deleteSecret, getSecret, getSecretsBackend, setSecret } from './secrets'

// Passwords → OS keychain (or AES-encrypted fallback). Metadata → flat JSON
// under ~/.dbstudio/ (DBeaver-style).
const DIR = path.join(os.homedir(), '.dbstudio')
const CONNECTIONS_FILE = path.join(DIR, 'connections.json')
const LAYOUT_FILE = path.join(DIR, 'layout.json')
const PREFERENCES_FILE = path.join(DIR, 'preferences.json')

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
}
