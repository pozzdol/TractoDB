// Column filter type detection + the typed filter model (BUG 10 / BUG 11).

export type FilterGroup = 'enum' | 'json' | 'numeric' | 'date'

/** Map a DB dataType string to a filter UI group. 'enum' falls back to a text
 *  search ("large") at runtime when SELECT DISTINCT returns > 100 values. */
export function getFilterGroup(dataType: string): FilterGroup {
  const t = dataType.toLowerCase()
  if (t.includes('json') || t.includes('[]') || t === 'array') return 'json'
  if (
    t.includes('int') ||
    t.includes('float') ||
    t.includes('decimal') ||
    t.includes('numeric') ||
    t.includes('double') ||
    t.includes('real')
  )
    return 'numeric'
  if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return 'date'
  return 'enum'
}

/** JSONB/array/JSON columns can't be sorted directly in most engines. */
export function isSortable(dataType: string): boolean {
  return getFilterGroup(dataType) !== 'json'
}

export type TextMode = 'contains' | 'exact' | 'starts' | 'ends' | 'keyExists' | 'null' | 'notNull'
export type NumMode = 'between' | 'gt' | 'lt' | 'eq' | 'null' | 'notNull'
export type DateMode = 'between' | 'after' | 'before' | 'null' | 'notNull'

/** A column filter descriptor — produced by FilterPopover, consumed by the
 *  dialect-aware WHERE builder in TableData. */
export type ColumnFilter =
  | { kind: 'values'; values: unknown[] }
  | { kind: 'text'; mode: TextMode; value: string }
  | { kind: 'numeric'; mode: NumMode; min: string; max: string; value: string }
  | { kind: 'date'; mode: DateMode; from: string; to: string }
