import { create } from 'zustand'
import type { PersistedTab } from '@shared/ipc'
import { api } from './ipcClient'

export type TabType = 'query-editor' | 'table-viewer'

interface BaseTab {
  id: string
  type: TabType
  title: string
  connectionId: string | null
}

export interface QueryEditorTab extends BaseTab {
  type: 'query-editor'
  sql: string
  database: string | null
  /** Set when this tab is bound to a saved query (drives Update vs Save). */
  savedQueryId?: string
}

export interface TableViewerTab extends BaseTab {
  type: 'table-viewer'
  database: string
  table: string
  schema?: string
}

export type Tab = QueryEditorTab | TableViewerTab

function newId(): string {
  return crypto.randomUUID()
}

function toPersisted(tab: Tab): PersistedTab {
  return tab.type === 'query-editor'
    ? {
        id: tab.id,
        type: tab.type,
        title: tab.title,
        connectionId: tab.connectionId,
        sql: tab.sql,
        database: tab.database,
        savedQueryId: tab.savedQueryId,
      }
    : {
        id: tab.id,
        type: tab.type,
        title: tab.title,
        connectionId: tab.connectionId,
        database: tab.database,
        table: tab.table,
        schema: tab.schema,
      }
}

function fromPersisted(p: PersistedTab): Tab {
  if (p.type === 'table-viewer') {
    return {
      id: p.id,
      type: 'table-viewer',
      title: p.title,
      connectionId: p.connectionId,
      database: p.database ?? '',
      table: p.table ?? '',
      schema: p.schema,
    }
  }
  return {
    id: p.id,
    type: 'query-editor',
    title: p.title,
    connectionId: p.connectionId,
    database: p.database ?? null,
    sql: p.sql ?? '',
    savedQueryId: p.savedQueryId,
  }
}

// Debounced persistence to layout.json (merged server-side with panel sizes).
let persistTimer: ReturnType<typeof setTimeout> | undefined
function persistSnapshot(tabs: Tab[], activeTabId: string | null): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      void api().config.saveLayout({ openTabs: tabs.map(toPersisted), activeTabId })
    } catch {
      /* bridge unavailable */
    }
  }, 400)
}

interface OpenQueryOptions {
  connectionId?: string | null
  database?: string | null
  sql?: string
  title?: string
  savedQueryId?: string
}

interface OpenTableOptions {
  connectionId: string
  database: string
  table: string
  schema?: string
}

export interface TabStore {
  tabs: Tab[]
  activeTabId: string | null
  /** Table-viewer tabs with unsaved staged edits (Feature 3 close protection). */
  dirtyTabs: Set<string>

  openQueryTab: (options?: OpenQueryOptions) => string
  openTableTab: (options: OpenTableOptions) => string
  setSavedQueryId: (id: string, savedQueryId: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateQuerySql: (id: string, sql: string) => void
  setTabTitle: (id: string, title: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  setTabDirty: (id: string, dirty: boolean) => void
  /** Restore tabs persisted in layout.json (called once on app start). */
  restore: () => Promise<void>
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  dirtyTabs: new Set(),

  openQueryTab(options = {}) {
    const id = newId()
    const tab: QueryEditorTab = {
      id,
      type: 'query-editor',
      title: options.title ?? 'Query',
      connectionId: options.connectionId ?? null,
      database: options.database ?? null,
      sql: options.sql ?? '',
      savedQueryId: options.savedQueryId,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  setSavedQueryId(id, savedQueryId) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.type === 'query-editor' ? { ...t, savedQueryId } : t,
      ),
    }))
  },

  openTableTab(options) {
    // Don't open a duplicate — focus the existing tab for this table instead.
    const existing = get().tabs.find(
      (t): t is TableViewerTab =>
        t.type === 'table-viewer' &&
        t.connectionId === options.connectionId &&
        t.database === options.database &&
        t.table === options.table,
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }
    const id = newId()
    const tab: TableViewerTab = {
      id,
      type: 'table-viewer',
      title: options.table,
      connectionId: options.connectionId,
      database: options.database,
      table: options.table,
      schema: options.schema,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  closeTab(id) {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      if (index === -1) return s
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        // Prefer the tab that shifts into this slot, else the previous one.
        const neighbour = tabs[index] ?? tabs[index - 1] ?? null
        activeTabId = neighbour ? neighbour.id : null
      }
      let dirtyTabs = s.dirtyTabs
      if (dirtyTabs.has(id)) {
        dirtyTabs = new Set(dirtyTabs)
        dirtyTabs.delete(id)
      }
      return { tabs, activeTabId, dirtyTabs }
    })
  },

  setTabDirty(id, dirty) {
    set((s) => {
      if (dirty === s.dirtyTabs.has(id)) return s
      const dirtyTabs = new Set(s.dirtyTabs)
      if (dirty) dirtyTabs.add(id)
      else dirtyTabs.delete(id)
      return { dirtyTabs }
    })
  },

  setActiveTab(id) {
    set({ activeTabId: id })
  },

  updateQuerySql(id, sql) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.type === 'query-editor' ? { ...t, sql } : t,
      ),
    }))
  },

  setTabTitle(id, title) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }))
  },

  reorderTabs(fromIndex, toIndex) {
    set((s) => {
      if (fromIndex === toIndex) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      if (!moved) return s
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  },

  async restore() {
    try {
      const res = await api().config.loadLayout()
      if (res.success && res.data.openTabs && res.data.openTabs.length > 0) {
        const tabs = res.data.openTabs.map(fromPersisted)
        const activeTabId =
          res.data.activeTabId && tabs.some((t) => t.id === res.data.activeTabId)
            ? res.data.activeTabId
            : (tabs[0]?.id ?? null)
        set({ tabs, activeTabId })
      }
    } catch {
      /* bridge unavailable */
    }
  },
}))

// Persist tab state on every change (debounced).
useTabStore.subscribe((state) => persistSnapshot(state.tabs, state.activeTabId))
