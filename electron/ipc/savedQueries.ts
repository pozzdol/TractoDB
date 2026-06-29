import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { IPC, ipcError, ipcSuccess } from '../../shared/ipc'
import type { SavedQuery } from '../../shared/ipc'
import { describeError } from './drivers/base'

const DIR = path.join(os.homedir(), '.tractodb')
const FILE = path.join(DIR, 'saved-queries.json')

interface Store {
  queries: SavedQuery[]
}

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Store
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { queries: [] }
    throw err
  }
}

async function write(store: Store): Promise<void> {
  await fs.mkdir(DIR, { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8')
}

function nowIso(): string {
  return new Date().toISOString()
}

async function handleList(connectionId: string, database: string): Promise<SavedQuery[]> {
  const { queries } = await read()
  return queries
    .filter((q) => q.connectionId === connectionId && q.database === database)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function handleSave(query: SavedQuery): Promise<SavedQuery> {
  const store = await read()
  const index = store.queries.findIndex((q) => q.id === query.id)
  let saved: SavedQuery
  if (index >= 0) {
    // Update — keep createdAt, refresh name/sql/updatedAt.
    saved = { ...store.queries[index]!, name: query.name, sql: query.sql, updatedAt: nowIso() }
    store.queries[index] = saved
  } else {
    saved = { ...query, createdAt: nowIso(), updatedAt: nowIso() }
    store.queries.push(saved)
  }
  await write(store)
  return saved
}

async function handleDelete(id: string): Promise<{ deleted: string }> {
  const store = await read()
  store.queries = store.queries.filter((q) => q.id !== id)
  await write(store)
  return { deleted: id }
}

async function handleRename(id: string, name: string): Promise<SavedQuery> {
  const store = await read()
  const q = store.queries.find((x) => x.id === id)
  if (!q) throw new Error('Saved query not found.')
  q.name = name
  q.updatedAt = nowIso()
  await write(store)
  return q
}

export function registerSavedQueryHandlers(): void {
  ipcMain.handle(IPC.SAVED_QUERY.LIST, async (_e, connectionId: string, database: string) => {
    try {
      return ipcSuccess(await handleList(connectionId, database))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
  ipcMain.handle(IPC.SAVED_QUERY.SAVE, async (_e, query: SavedQuery) => {
    try {
      return ipcSuccess(await handleSave(query))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
  ipcMain.handle(IPC.SAVED_QUERY.DELETE, async (_e, id: string) => {
    try {
      return ipcSuccess(await handleDelete(id))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
  ipcMain.handle(IPC.SAVED_QUERY.RENAME, async (_e, id: string, name: string) => {
    try {
      return ipcSuccess(await handleRename(id, name))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
