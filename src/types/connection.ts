// Connection types for the renderer. The wire types live in shared/ipc.ts
// (single source of truth); this file re-exports them and adds UI-only types.

export type {
  ActiveConnection,
  ConnectionConfig,
  ConnectionStatus,
  ConnectionWithPassword,
  DatabaseType,
} from '@shared/ipc'

import type { ConnectionConfig, ConnectionStatus, DatabaseType } from '@shared/ipc'
import type { DatabaseNode } from './schema'

/**
 * Per-database-type metadata that drives the connection form and the sidebar
 * icon colour. `colorVar` references a CSS custom property from DESIGN.md, so
 * components can use it for the (dynamic) icon fill.
 */
export interface DatabaseTypeMeta {
  type: DatabaseType
  label: string
  defaultPort?: number
  colorVar: string
  /** SQLite uses a file path instead of host/port/auth. */
  usesFile: boolean
  usesHostPort: boolean
  usesDatabase: boolean
  usesUsername: boolean
  usesPassword: boolean
}

export const DATABASE_TYPES: readonly DatabaseTypeMeta[] = [
  {
    type: 'postgresql',
    label: 'PostgreSQL',
    defaultPort: 5432,
    colorVar: 'var(--db-postgresql)',
    usesFile: false,
    usesHostPort: true,
    usesDatabase: true,
    usesUsername: true,
    usesPassword: true,
  },
  {
    type: 'mysql',
    label: 'MySQL',
    defaultPort: 3306,
    colorVar: 'var(--db-mysql)',
    usesFile: false,
    usesHostPort: true,
    usesDatabase: true,
    usesUsername: true,
    usesPassword: true,
  },
  {
    type: 'sqlite',
    label: 'SQLite',
    colorVar: 'var(--db-sqlite)',
    usesFile: true,
    usesHostPort: false,
    usesDatabase: false,
    usesUsername: false,
    usesPassword: false,
  },
  {
    type: 'redis',
    label: 'Redis',
    defaultPort: 6379,
    colorVar: 'var(--db-redis)',
    usesFile: false,
    usesHostPort: true,
    // Redis "database" is a numeric index (0–15 by default).
    usesDatabase: true,
    usesUsername: false,
    usesPassword: true,
  },
]

export function databaseTypeMeta(type: DatabaseType): DatabaseTypeMeta {
  const meta = DATABASE_TYPES.find((m) => m.type === type)
  if (!meta) throw new Error(`Unknown database type: ${type}`)
  return meta
}

/**
 * Renderer-side view of a connection: its saved config, live status, and the
 * lazily-loaded schema tree. Held in connectionStore.
 */
export interface ConnectionState {
  config: ConnectionConfig
  status: ConnectionStatus
  databaseVersion?: string
  errorMessage?: string
  /** Top-level node expanded in the sidebar. */
  expanded: boolean
  /** True while databases are being fetched after connect. */
  loadingSchema: boolean
  /** Lazily-loaded database/table/column tree. */
  databases: DatabaseNode[]
}
