import { create } from 'zustand'
import type { SavedQuery } from '@shared/ipc'
import { api, unwrap } from './ipcClient'

export interface SavedQueryStore {
  queries: SavedQuery[]
  load: (connectionId: string, database: string) => Promise<void>
  save: (query: SavedQuery) => Promise<SavedQuery>
  delete: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
}

export const useSavedQueryStore = create<SavedQueryStore>((set) => ({
  queries: [],

  async load(connectionId, database) {
    set({ queries: unwrap(await api().savedQuery.list(connectionId, database)) })
  },

  async save(query) {
    const saved = unwrap(await api().savedQuery.save(query))
    set((s) => {
      const exists = s.queries.some((q) => q.id === saved.id)
      return {
        queries: exists ? s.queries.map((q) => (q.id === saved.id ? saved : q)) : [saved, ...s.queries],
      }
    })
    return saved
  },

  async delete(id) {
    unwrap(await api().savedQuery.delete(id))
    set((s) => ({ queries: s.queries.filter((q) => q.id !== id) }))
  },

  async rename(id, name) {
    const updated = unwrap(await api().savedQuery.rename(id, name))
    set((s) => ({ queries: s.queries.map((q) => (q.id === id ? updated : q)) }))
  },
}))

/**
 * Optimistically remove a query and show an "Undo" toast; the IPC delete only
 * fires after the grace period if the user didn't undo. (BUG 6)
 */
export function deleteSavedQueryWithUndo(
  query: SavedQuery,
  showToast: (message: string, action?: { label: string; onClick: () => void }) => void,
): void {
  const prev = useSavedQueryStore.getState().queries
  useSavedQueryStore.setState({ queries: prev.filter((q) => q.id !== query.id) })
  let undone = false
  const timer = setTimeout(() => {
    if (!undone) void api().savedQuery.delete(query.id)
  }, 3000)
  showToast(`Deleted '${query.name}'`, {
    label: 'Undo',
    onClick: () => {
      undone = true
      clearTimeout(timer)
      useSavedQueryStore.setState({ queries: prev })
    },
  })
}
