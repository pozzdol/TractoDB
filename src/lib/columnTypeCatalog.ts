// Per-dialect column type catalog + length/precision helpers (BUG 12).
import type { DatabaseType } from '@/types/connection'

export interface TypeGroup {
  label: string
  types: string[]
}

const POSTGRES: TypeGroup[] = [
  { label: 'Numeric', types: ['smallint', 'integer', 'bigint', 'decimal', 'numeric', 'real', 'double precision', 'smallserial', 'serial', 'bigserial'] },
  { label: 'Text', types: ['varchar', 'char', 'text', 'citext', 'name'] },
  { label: 'Binary', types: ['bytea'] },
  { label: 'Date/Time', types: ['timestamp', 'timestamptz', 'date', 'time', 'timetz', 'interval'] },
  { label: 'Boolean', types: ['boolean'] },
  { label: 'JSON', types: ['json', 'jsonb'] },
  { label: 'Network', types: ['inet', 'cidr', 'macaddr', 'macaddr8'] },
  { label: 'Geometric', types: ['point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle'] },
  { label: 'UUID', types: ['uuid'] },
  { label: 'Other', types: ['xml', 'bit', 'bit varying', 'tsvector', 'tsquery', 'pg_lsn', 'money'] },
]

const MYSQL: TypeGroup[] = [
  { label: 'Numeric', types: ['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double', 'bit'] },
  { label: 'Text', types: ['varchar', 'char', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set'] },
  { label: 'Binary', types: ['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob'] },
  { label: 'Date/Time', types: ['date', 'datetime', 'timestamp', 'time', 'year'] },
  { label: 'JSON', types: ['json'] },
]

const SQLITE: TypeGroup[] = [
  {
    label: 'Affinities',
    types: ['INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC', 'VARCHAR', 'CHAR', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP', 'FLOAT', 'DOUBLE'],
  },
]

export function typeGroupsFor(db: DatabaseType): TypeGroup[] {
  if (db === 'postgresql') return POSTGRES
  if (db === 'mysql') return MYSQL
  return SQLITE
}

const LENGTH_TYPES = new Set(['varchar', 'char', 'varbinary', 'binary', 'bit', 'bit varying', 'citext', 'name'])
const PRECISION_TYPES = new Set(['decimal', 'numeric', 'float', 'double precision', 'real', 'double'])

export type LengthKind = 'none' | 'length' | 'precision'

/** Whether a base type takes (length), (precision[,scale]), or nothing. */
export function lengthKind(baseType: string): LengthKind {
  const t = baseType.trim().toLowerCase()
  if (PRECISION_TYPES.has(t)) return 'precision'
  if (LENGTH_TYPES.has(t)) return 'length'
  return 'none'
}

export interface TypeParts {
  baseType: string
  length?: string
  precision?: string
  scale?: string
  isArray?: boolean
}

/** Assemble a base type + length/precision back into a full SQL type string. */
export function buildTypeString(p: TypeParts): string {
  const kind = lengthKind(p.baseType)
  let out = p.baseType
  if (kind === 'precision' && p.precision && p.precision.trim() !== '') {
    out += p.scale && p.scale.trim() !== '' ? `(${p.precision},${p.scale})` : `(${p.precision})`
  } else if (kind === 'length' && p.length && p.length.trim() !== '') {
    out += `(${p.length})`
  }
  if (p.isArray) out += '[]'
  return out
}
