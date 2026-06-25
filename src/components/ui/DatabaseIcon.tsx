import redisUrl from '@/assets/icons/redis.svg'
import sqliteUrl from '@/assets/icons/sqlite.svg'
import type { DatabaseType } from '@/types/connection'

interface DatabaseIconProps {
  type: DatabaseType
  size?: number
  className?: string
}

// Brand colors per database — used for UIcons tinting and UI accents.
export const DB_COLORS: Record<DatabaseType, string> = {
  postgresql: '#336791',
  mysql: '#E48E00',
  sqlite: '#0F80CC',
  redis: '#DC382D',
}

export const DB_LABELS: Record<DatabaseType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  redis: 'Redis',
}

// UIcons brand classes where available (verified in @flaticon/flaticon-uicons).
const UICONS_CLASS: Partial<Record<DatabaseType, string>> = {
  postgresql: 'fi fi-brands-postgre',
  mysql: 'fi fi-brands-mysql',
}

// SVG fallback for databases not in UIcons brands.
const SVG_FALLBACK: Partial<Record<DatabaseType, string>> = {
  sqlite: sqliteUrl,
  redis: redisUrl,
}

/** Brand icon for a database type — UIcons glyph (pg/mysql) or SVG (sqlite/redis). */
export function DatabaseIcon({ type, size = 16, className = '' }: DatabaseIconProps) {
  const uiconsClass = UICONS_CLASS[type]
  if (uiconsClass) {
    return (
      <i
        className={`${uiconsClass} ${className}`.trim()}
        style={{ fontSize: size, color: DB_COLORS[type], lineHeight: 1 }}
        aria-hidden="true"
      />
    )
  }
  return (
    <img
      src={SVG_FALLBACK[type]}
      width={size}
      height={size}
      alt={DB_LABELS[type]}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      aria-hidden="true"
    />
  )
}
