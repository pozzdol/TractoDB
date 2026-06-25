import type { DatabaseType } from '../../../shared/ipc'

/**
 * Error carried back to the renderer. Only `message` (plain English) and an
 * optional `code` ever cross IPC — raw stack traces never leave the main process.
 */
export class DriverError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'DriverError'
    this.code = code
  }
}

// ─── Per-engine code → plain-English maps (TASKS.md Phase 2.5) ─────────────────

const POSTGRES: Record<string, string> = {
  '28P01': 'Authentication failed: wrong password',
  '3D000': 'Database does not exist',
  '08006': 'Connection failed: server unreachable',
  '08001': 'Connection failed: server unreachable',
  '57014': 'Query cancelled by user',
  '42501': 'Permission denied',
}

const MYSQL: Record<string, string> = {
  ER_ACCESS_DENIED_ERROR: 'Authentication failed: wrong username or password',
  ER_BAD_DB_ERROR: 'Database does not exist',
  ECONNREFUSED: 'Connection failed: server not running or wrong port',
  ER_QUERY_INTERRUPTED: 'Query cancelled by user',
  PROTOCOL_CONNECTION_LOST: 'Connection to the server was lost',
}

const SQLITE: Record<string, string> = {
  SQLITE_CANTOPEN: 'Cannot open file: check path and permissions',
  SQLITE_READONLY: 'File is read-only',
  SQLITE_CORRUPT: 'Database file is corrupted',
}

const REDIS: Record<string, string> = {
  WRONGPASS: 'Authentication failed: wrong password',
  ECONNREFUSED: 'Connection failed: Redis server not running',
  NOAUTH: 'Authentication required: add a password to the connection config',
}

// Network-level codes shared by the TCP engines.
const NETWORK: Record<string, string> = {
  ECONNREFUSED: 'Connection failed: server not running or wrong port',
  ENOTFOUND: 'Connection failed: host not found — check the hostname',
  ETIMEDOUT: 'Connection timed out — check host, port, and firewall',
  EHOSTUNREACH: 'Connection failed: host unreachable',
}

const MAPS: Record<DatabaseType, Record<string, string>> = {
  postgresql: POSTGRES,
  mysql: MYSQL,
  sqlite: SQLITE,
  redis: REDIS,
}

function codeOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') return code
    if (typeof code === 'number') return String(code)
  }
  return undefined
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown database error'
}

/**
 * Translate a raw driver error into a `DriverError` with a plain-English message.
 * Drivers MUST funnel every thrown error through this before it reaches IPC.
 */
export function translateError(err: unknown, db: DatabaseType): DriverError {
  if (err instanceof DriverError) return err

  const code = codeOf(err)
  const raw = messageOf(err)
  const map = MAPS[db]

  let friendly: string | undefined
  if (code && map[code]) friendly = map[code]

  // Redis surfaces auth failures as message prefixes, not error codes.
  if (!friendly && db === 'redis') {
    if (/WRONGPASS/i.test(raw)) friendly = REDIS.WRONGPASS
    else if (/NOAUTH/i.test(raw)) friendly = REDIS.NOAUTH
  }

  // Fall back to a shared network-level message.
  if (!friendly && code && NETWORK[code]) friendly = NETWORK[code]

  return new DriverError(friendly ?? raw, code)
}

/** True when an error indicates the connection was dropped (triggers one retry). */
export function isConnectionDropped(err: unknown): boolean {
  const code = codeOf(err)
  if (!code) return false
  return [
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'PROTOCOL_CONNECTION_LOST',
    '08006', // postgres: connection failure
    '08003', // postgres: connection does not exist
    '57P01', // postgres: admin shutdown
  ].includes(code)
}
