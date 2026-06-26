import { create } from 'zustand'

export interface TableRef {
  connectionId: string
  database: string
  schema?: string
  name: string
}

export function tableKey(r: TableRef): string {
  return `${r.connectionId}/${r.database}/${r.schema ?? ''}/${r.name}`
}

interface TableSelectionStore {
  selected: Map<string, TableRef>
  lastClicked: TableRef | null
  selectOnly: (ref: TableRef) => void
  toggle: (ref: TableRef) => void
  /** Shift-range within the same connection/database/schema only. */
  selectRange: (ref: TableRef, siblings: TableRef[]) => void
  /** Right-click helper: select only this one if it isn't already in the set. */
  selectIfNot: (ref: TableRef) => void
  clear: () => void
}

const sameParent = (a: TableRef, b: TableRef): boolean =>
  a.connectionId === b.connectionId && a.database === b.database && (a.schema ?? '') === (b.schema ?? '')

export const useTableSelection = create<TableSelectionStore>((set, get) => ({
  selected: new Map(),
  lastClicked: null,

  selectOnly(ref) {
    set({ selected: new Map([[tableKey(ref), ref]]), lastClicked: ref })
  },

  toggle(ref) {
    set((s) => {
      const next = new Map(s.selected)
      const k = tableKey(ref)
      if (next.has(k)) next.delete(k)
      else next.set(k, ref)
      return { selected: next, lastClicked: ref }
    })
  },

  selectRange(ref, siblings) {
    const last = get().lastClicked
    if (!last || !sameParent(last, ref)) {
      get().selectOnly(ref)
      return
    }
    const keys = siblings.map(tableKey)
    const i1 = keys.indexOf(tableKey(last))
    const i2 = keys.indexOf(tableKey(ref))
    if (i1 < 0 || i2 < 0) {
      get().selectOnly(ref)
      return
    }
    const [lo, hi] = [Math.min(i1, i2), Math.max(i1, i2)]
    set((s) => {
      const next = new Map(s.selected) // merge with existing — don't move the anchor
      for (let i = lo; i <= hi; i++) {
        const sib = siblings[i]
        if (sib) next.set(tableKey(sib), sib)
      }
      return { selected: next }
    })
  },

  selectIfNot(ref) {
    if (!get().selected.has(tableKey(ref))) get().selectOnly(ref)
  },

  clear() {
    set({ selected: new Map(), lastClicked: null })
  },
}))
