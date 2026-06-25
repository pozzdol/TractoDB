import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { type ChildProcess, spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import {
  IPC,
  type BackupConfig,
  type BackupDatabaseType,
  type BackupProgress,
  type ConnectionConfig,
  type NativeClientConfig,
  type RestoreConfig,
  ipcError,
  ipcSuccess,
} from '../../../shared/ipc'
import { getNativeClient, getStoredPassword, loadConnections, setNativeClient } from '../config'
import { describeError } from '../drivers/base'
import { detectAll, detectMySQL, detectPostgreSQL } from './clientDetector'
import * as pg from './builders/postgresql'
import * as my from './builders/mysql'

// Only one backup/restore runs at a time (matches the single progress panel).
let currentChild: ChildProcess | null = null

/** Reject absolute-only paths that try to traverse out via "..". */
function isSafePath(p: string): boolean {
  if (!p || !path.isAbsolute(p)) return false
  return !path.normalize(p).split(path.sep).includes('..')
}

async function resolveBinDir(type: BackupDatabaseType): Promise<string | null> {
  const override = (await getNativeClient())[type]
  if (override && existsSync(override)) return override
  const detected = type === 'postgresql' ? await detectPostgreSQL() : await detectMySQL()
  return detected.found && detected.path ? detected.path : null
}

function binPath(dir: string, name: string): string | null {
  const p = path.join(dir, name)
  return existsSync(p) ? p : null
}

async function lookupConnection(connectionId: string): Promise<ConnectionConfig | undefined> {
  return (await loadConnections()).find((c) => c.id === connectionId)
}

function passwordEnv(type: BackupDatabaseType, password: string | undefined): NodeJS.ProcessEnv {
  if (!password) return {}
  // Password via env var — never as a CLI arg (visible in `ps aux`).
  return type === 'postgresql' ? { PGPASSWORD: password } : { MYSQL_PWD: password }
}

/** Stream a spawned process's output to the renderer line-by-line. */
function streamProcess(
  event: IpcMainInvokeEvent,
  child: ChildProcess,
  stdinFile?: string,
): void {
  currentChild = child
  const send = (progress: BackupProgress): void => {
    if (!event.sender.isDestroyed()) event.sender.send(IPC.BACKUP.PROGRESS, progress)
  }

  const pump = (stream: NodeJS.ReadableStream | null, isError: boolean): void => {
    if (!stream) return
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) send({ line, isError, isDone: false })
    })
    stream.on('end', () => {
      if (buffer.length > 0) send({ line: buffer, isError, isDone: false })
    })
  }

  pump(child.stdout, false)
  pump(child.stderr, true)

  if (stdinFile && child.stdin) {
    createReadStream(stdinFile).pipe(child.stdin)
  }

  child.on('error', (err) => {
    currentChild = null
    send({ line: err.message, isError: true, isDone: true, exitCode: -1 })
  })
  child.on('close', (code) => {
    currentChild = null
    send({ line: '', isError: code !== 0, isDone: true, exitCode: code ?? -1 })
  })
}

async function handleStartBackup(
  event: IpcMainInvokeEvent,
  config: BackupConfig,
): Promise<void> {
  if (!isSafePath(config.outputPath)) {
    throw new Error('Invalid output path.')
  }
  const conn = await lookupConnection(config.connectionId)
  if (!conn) throw new Error('Connection not found.')
  const password = await getStoredPassword(config.connectionId)

  const dir = await resolveBinDir(config.databaseType)
  if (config.databaseType === 'postgresql') {
    const bin = dir && binPath(dir, 'pg_dump')
    if (!bin) {
      throw new Error(
        'pg_dump not found. Install postgresql-client or set the path in Settings → Local Client.',
      )
    }
    const child = spawn(bin, pg.buildDumpArgs(config, conn), {
      env: { ...process.env, ...passwordEnv('postgresql', password) },
    })
    streamProcess(event, child)
  } else {
    const bin = dir && binPath(dir, 'mysqldump')
    if (!bin) {
      throw new Error(
        'mysqldump not found. Install mysql-client or set the path in Settings → Local Client.',
      )
    }
    const child = spawn(bin, my.buildDumpArgs(config, conn), {
      env: { ...process.env, ...passwordEnv('mysql', password) },
    })
    streamProcess(event, child)
  }
}

async function handleStartRestore(
  event: IpcMainInvokeEvent,
  config: RestoreConfig,
): Promise<void> {
  if (!isSafePath(config.inputPath) || !existsSync(config.inputPath)) {
    throw new Error('Input file not found.')
  }
  const conn = await lookupConnection(config.connectionId)
  if (!conn) throw new Error('Connection not found.')
  const password = await getStoredPassword(config.connectionId)

  const dir = await resolveBinDir(config.databaseType)
  if (config.databaseType === 'postgresql') {
    const isPlainSql = /\.sql$/i.test(config.inputPath)
    const binName = isPlainSql ? 'psql' : 'pg_restore'
    const bin = dir && binPath(dir, binName)
    if (!bin) {
      throw new Error(
        `${binName} not found. Install postgresql-client or set the path in Settings → Local Client.`,
      )
    }
    const args = isPlainSql
      ? pg.buildPsqlRestoreArgs(config, conn)
      : pg.buildRestoreArgs(config, conn)
    const child = spawn(bin, args, {
      env: { ...process.env, ...passwordEnv('postgresql', password) },
    })
    streamProcess(event, child)
  } else {
    const bin = dir && binPath(dir, 'mysql')
    if (!bin) {
      throw new Error(
        'mysql client not found. Install mysql-client or set the path in Settings → Local Client.',
      )
    }
    const child = spawn(bin, my.buildRestoreArgs(config, conn), {
      env: { ...process.env, ...passwordEnv('mysql', password) },
    })
    // MySQL restore reads the dump from stdin.
    streamProcess(event, child, config.inputPath)
  }
}

export function registerBackupHandlers(): void {
  ipcMain.handle(IPC.BACKUP.START_BACKUP, async (event, config: BackupConfig) => {
    try {
      await handleStartBackup(event, config)
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.BACKUP.START_RESTORE, async (event, config: RestoreConfig) => {
    try {
      await handleStartRestore(event, config)
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.BACKUP.CANCEL, () => {
    currentChild?.kill('SIGTERM')
    return ipcSuccess(undefined)
  })

  ipcMain.handle(IPC.BACKUP.DETECT_CLIENT, async () => {
    try {
      return ipcSuccess(await detectAll())
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.BACKUP.SAVE_CLIENT, async (_e, config: NativeClientConfig) => {
    try {
      await setNativeClient(config)
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.BACKUP.LOAD_CLIENT, async () => {
    try {
      return ipcSuccess(await getNativeClient())
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
