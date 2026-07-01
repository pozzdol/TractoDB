// Parse a DB column type string into base type + length/precision/scale (BUG 12).

export interface ParsedType {
  baseType: string // normalized base type name
  length?: number // for varchar, char, etc.
  precision?: number // for numeric, decimal
  scale?: number // for numeric, decimal
  isArray: boolean // true if type ends in []
}

// Base types that take (precision[, scale]) rather than (length).
const PRECISION_BASES = new Set(['numeric', 'decimal', 'float', 'double precision', 'real', 'double'])

// Normalize verbose SQL type spellings to the catalog's base names.
function normalizeBase(raw: string): string {
  const t = raw.trim().toLowerCase()
  const map: Record<string, string> = {
    'character varying': 'varchar',
    character: 'char',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'time without time zone': 'time',
    'time with time zone': 'timetz',
    'bit varying': 'bit varying',
    int4: 'integer',
    int8: 'bigint',
    int2: 'smallint',
    int: 'integer',
    bool: 'boolean',
  }
  return map[t] ?? t
}

export function parseColumnType(raw: string): ParsedType {
  let s = (raw ?? '').trim()
  const isArray = s.endsWith('[]')
  if (isArray) s = s.slice(0, -2).trim()

  const m = /^(.*?)\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)\s*$/.exec(s)
  if (!m) return { baseType: normalizeBase(s), isArray }

  const base = normalizeBase(m[1] ?? '')
  const n1 = Number(m[2])
  if (m[3] !== undefined) {
    return { baseType: base, precision: n1, scale: Number(m[3]), isArray }
  }
  // One number: precision for numeric-family types, length otherwise.
  if (PRECISION_BASES.has(base)) return { baseType: base, precision: n1, isArray }
  return { baseType: base, length: n1, isArray }
}
