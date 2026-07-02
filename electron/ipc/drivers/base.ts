import type {
  ColumnInfo,
  ConnectionWithPassword,
  DatabaseInfo,
  QueryResult,
  TableInfo,
} from '../../../shared/ipc'

/**
 * Every database engine adapter implements this interface. The connection
 * manager (connection.ts) instantiates one driver per active connection and
 * routes query/schema IPC calls to it.
 *
 * Note: `listDatabases` returns `DatabaseInfo[]` (richer than the bare
 * `string[]` sketched in TASKS.md) so the sidebar can show owner/size without a
 * second round-trip.
 */
export interface DatabaseDriver {
  /** Open the underlying connection. Throws a friendly Error on failure. */
  connect(): Promise<void>
  /** Close the connection. Safe to call when already closed. */
  disconnect(): Promise<void>
  /** Open, ping, and close — used by the connection-test flow. */
  testConnection(): Promise<boolean>
  /** Human-readable server version string (e.g. "PostgreSQL 16.2"). */
  getServerVersion(): Promise<string>
  /** Lightweight liveness check (SELECT 1 / PING) with a short timeout. */
  ping(): Promise<boolean>
  /** Run a statement and return rows + column metadata + timing. */
  query(sql: string): Promise<QueryResult>
  /** Databases/keyspaces visible to this connection. */
  listDatabases(): Promise<DatabaseInfo[]>
  /** Tables/views (or key-pattern groups, for Redis) in a database. */
  listTables(database: string): Promise<TableInfo[]>
  /** Columns (or keys, for Redis) of a table. */
  listColumns(database: string, table: string): Promise<ColumnInfo[]>
  /** Best-effort cancellation of the in-flight query. No-op where unsupported. */
  cancel(): Promise<void>
  /** Redis only: fetch a key's value (or a prefix group's key list) as a table. */
  getRedisKeyValue?(database: string, keyName: string): Promise<QueryResult>
}

/** Factory input — a connection config plus the transiently-held password. */
export type DriverConfig = ConnectionWithPassword

/** Monotonic-ish wall clock for query timing (ms). */
export function nowMs(): number {
  return Date.now()
}

/**
 * Normalises a thrown driver value into a single-line, user-facing message.
 * Engine-specific code translation happens in each driver before re-throwing;
 * this is the catch-all so the renderer never sees `[object Object]`.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown database error'
  }
}

/** Wrap a slow operation so connection tests can't hang forever (AGENTS.md: 10s). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
