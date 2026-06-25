import { create } from 'zustand'
import type { PersistedTab } from '@shared/ipc'
import { api } from './ipcClient'

export type TabType = 'query-editor' | 'table-browser'

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
}

export interface TableBrowserTab extends BaseTab {
  type: 'table-browser'
  database: string
  table: string
}

export type Tab = QueryEditorTab | TableBrowserTab

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
      }
    : {
        id: tab.id,
        type: tab.type,
        title: tab.title,
        connectionId: tab.connectionId,
        database: tab.database,
        table: tab.table,
      }
}

function fromPersisted(p: PersistedTab): Tab {
  if (p.type === 'table-browser') {
    return {
      id: p.id,
      type: 'table-browser',
      title: p.title,
      connectionId: p.connectionId,
      database: p.database ?? '',
      table: p.table ?? '',
    }
  }
  return {
    id: p.id,
    type: 'query-editor',
    title: p.title,
    connectionId: p.connectionId,
    database: p.database ?? null,
    sql: p.sql ?? '',
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
}

interface OpenTableOptions {
  connectionId: string
  database: string
  table: string
}

export interface TabStore {
  tabs: Tab[]
  activeTabId: string | null

  openQueryTab: (options?: OpenQueryOptions) => string
  openTableTab: (options: OpenTableOptions) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateQuerySql: (id: string, sql: string) => void
  setTabTitle: (id: string, title: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  /** Restore tabs persisted in layout.json (called once on app start). */
  restore: () => Promise<void>
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openQueryTab(options = {}) {
    const id = newId()
    const tab: QueryEditorTab = {
      id,
      type: 'query-editor',
      title: options.title ?? 'Query',
      connectionId: options.connectionId ?? null,
      database: options.database ?? null,
      sql: options.sql ?? '',
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  openTableTab(options) {
    // Don't open a duplicate — focus the existing tab for this table instead.
    const existing = get().tabs.find(
      (t): t is TableBrowserTab =>
        t.type === 'table-browser' &&
        t.connectionId === options.connectionId &&
        t.database === options.database &&
        t.table === options.table,
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }
    const id = newId()
    const tab: TableBrowserTab = {
      id,
      type: 'table-browser',
      title: options.table,
      connectionId: options.connectionId,
      database: options.database,
      table: options.table,
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
      return { tabs, activeTabId }
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
