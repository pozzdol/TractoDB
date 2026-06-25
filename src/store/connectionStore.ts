import { create } from 'zustand'
import type {
  ConnectionConfig,
  ConnectionState,
  ConnectionWithPassword,
} from '@/types/connection'
import type { DatabaseNode, TableNode } from '@/types/schema'
import { api, unwrap } from './ipcClient'

// ─── Immutable nested-update helpers ───────────────────────────────────────────

function mapConnection(
  conns: ConnectionState[],
  id: string,
  fn: (c: ConnectionState) => ConnectionState,
): ConnectionState[] {
  return conns.map((c) => (c.config.id === id ? fn(c) : c))
}

function mapDatabase(
  dbs: DatabaseNode[],
  name: string,
  fn: (d: DatabaseNode) => DatabaseNode,
): DatabaseNode[] {
  return dbs.map((d) => (d.name === name ? fn(d) : d))
}

function mapTable(
  tables: TableNode[],
  name: string,
  fn: (t: TableNode) => TableNode,
): TableNode[] {
  return tables.map((t) => (t.name === name ? fn(t) : t))
}

function toConnectionState(config: ConnectionConfig): ConnectionState {
  return { config, status: 'disconnected', expanded: false, loadingSchema: false, databases: [] }
}

// ─── Store ──────────────────────────────────────────────────────────────────

export interface ConnectionStore {
  connections: ConnectionState[]
  activeConnectionId: string | null
  activeDatabase: string | null

  loadConnections: () => Promise<void>
  saveConnection: (input: ConnectionWithPassword) => Promise<ConnectionConfig>
  removeConnection: (id: string) => Promise<void>
  testConnection: (input: ConnectionWithPassword) => Promise<boolean>

  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  setActive: (id: string, database?: string) => void

  toggleConnection: (id: string) => Promise<void>
  toggleDatabase: (id: string, database: string) => Promise<void>
  toggleTable: (id: string, database: string, table: string) => Promise<void>

  // Lazy schema loaders. Public so a Refresh action can call them directly;
  // normally triggered by the toggle* actions on first expand.
  loadDatabasesInternal: (id: string) => Promise<void>
  loadTablesInternal: (id: string, database: string) => Promise<void>
  loadColumnsInternal: (id: string, database: string, table: string) => Promise<void>
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  activeDatabase: null,

  async loadConnections() {
    const configs = unwrap(await api().config.loadConnections())
    set({ connections: configs.map(toConnectionState) })
  },

  async saveConnection(input) {
    const saved = unwrap(await api().config.saveConnection(input))
    set((s) => {
      const exists = s.connections.some((c) => c.config.id === saved.id)
      if (exists) {
        return {
          connections: mapConnection(s.connections, saved.id, (c) => ({ ...c, config: saved })),
        }
      }
      return { connections: [...s.connections, toConnectionState(saved)] }
    })
    return saved
  },

  async removeConnection(id) {
    await get().disconnect(id)
    unwrap(await api().config.deleteConnection(id))
    set((s) => ({
      connections: s.connections.filter((c) => c.config.id !== id),
      activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
    }))
  },

  async testConnection(input) {
    // Errors propagate so the form can show them inline.
    return unwrap(await api().connection.test(input))
  },

  async connect(id) {
    const conn = get().connections.find((c) => c.config.id === id)
    if (!conn) return
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        status: 'connecting',
        errorMessage: undefined,
      })),
    }))
    try {
      const active = unwrap(await api().connection.connect(conn.config))
      set((s) => ({
        connections: mapConnection(s.connections, id, (c) => ({
          ...c,
          status: 'connected',
          databaseVersion: active.databaseVersion,
          expanded: true,
        })),
        activeConnectionId: id,
        activeDatabase: conn.config.database ?? null,
      }))
      await get().loadDatabasesInternal(id)
    } catch (err) {
      set((s) => ({
        connections: mapConnection(s.connections, id, (c) => ({
          ...c,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        })),
      }))
    }
  },

  async disconnect(id) {
    const conn = get().connections.find((c) => c.config.id === id)
    if (!conn || conn.status === 'disconnected') return
    try {
      unwrap(await api().connection.disconnect(id))
    } finally {
      set((s) => ({
        connections: mapConnection(s.connections, id, (c) => ({
          ...c,
          status: 'disconnected',
          expanded: false,
          databases: [],
        })),
        activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
      }))
    }
  },

  setActive(id, database) {
    set({ activeConnectionId: id, activeDatabase: database ?? get().activeDatabase })
  },

  async toggleConnection(id) {
    const conn = get().connections.find((c) => c.config.id === id)
    if (!conn) return
    if (conn.status !== 'connected') {
      await get().connect(id)
      return
    }
    const expanded = !conn.expanded
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({ ...c, expanded })),
    }))
    if (expanded && conn.databases.length === 0 && !conn.loadingSchema) {
      await get().loadDatabasesInternal(id)
    }
  },

  async toggleDatabase(id, database) {
    const conn = get().connections.find((c) => c.config.id === id)
    const db = conn?.databases.find((d) => d.name === database)
    if (!conn || !db) return
    const expanded = !db.expanded
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({ ...d, expanded })),
      })),
    }))
    if (expanded && db.tables === undefined && !db.loadingTables) {
      await get().loadTablesInternal(id, database)
    }
  },

  async toggleTable(id, database, table) {
    const conn = get().connections.find((c) => c.config.id === id)
    const db = conn?.databases.find((d) => d.name === database)
    const node = db?.tables?.find((t) => t.name === table)
    if (!conn || !db || !node) return
    const expanded = !node.expanded
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({
          ...d,
          tables: d.tables ? mapTable(d.tables, table, (t) => ({ ...t, expanded })) : d.tables,
        })),
      })),
    }))
    if (expanded && node.columns === undefined && !node.loadingColumns) {
      await get().loadColumnsInternal(id, database, table)
    }
  },

  // ─── Internal lazy-loaders (not part of the public action surface) ──────────

  async loadDatabasesInternal(id: string) {
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({ ...c, loadingSchema: true })),
    }))
    try {
      const dbs = unwrap(await api().schema.listDatabases(id))
      set((s) => ({
        connections: mapConnection(s.connections, id, (c) => ({
          ...c,
          loadingSchema: false,
          databases: dbs.map((d) => ({ ...d, expanded: false, loadingTables: false })),
        })),
      }))
    } catch (err) {
      set((s) => ({
        connections: mapConnection(s.connections, id, (c) => ({
          ...c,
          loadingSchema: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        })),
      }))
    }
  },

  async loadTablesInternal(id: string, database: string) {
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({ ...d, loadingTables: true })),
      })),
    }))
    const tables = unwrap(await api().schema.listTables(id, database))
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({
          ...d,
          loadingTables: false,
          tables: tables.map((t) => ({ ...t, expanded: false, loadingColumns: false })),
        })),
      })),
    }))
  },

  async loadColumnsInternal(id: string, database: string, table: string) {
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({
          ...d,
          tables: d.tables
            ? mapTable(d.tables, table, (t) => ({ ...t, loadingColumns: true }))
            : d.tables,
        })),
      })),
    }))
    const columns = unwrap(await api().schema.listColumns(id, database, table))
    set((s) => ({
      connections: mapConnection(s.connections, id, (c) => ({
        ...c,
        databases: mapDatabase(c.databases, database, (d) => ({
          ...d,
          tables: d.tables
            ? mapTable(d.tables, table, (t) => ({ ...t, loadingColumns: false, columns }))
            : d.tables,
        })),
      })),
    }))
  },
}))
