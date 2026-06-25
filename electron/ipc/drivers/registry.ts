import type { DatabaseType } from '../../../shared/ipc'
import type { DatabaseDriver, DriverConfig } from './base'
import { PostgresDriver } from './postgresql'
import { MySqlDriver } from './mysql'
import { SqliteDriver } from './sqlite'
import { RedisDriver } from './redis'

type DriverConstructor = new (config: DriverConfig) => DatabaseDriver

/** Single place to register a driver. Add new engines here only. */
export const DriverRegistry: Record<DatabaseType, DriverConstructor> = {
  postgresql: PostgresDriver,
  mysql: MySqlDriver,
  sqlite: SqliteDriver,
  redis: RedisDriver,
}

export function createDriver(config: DriverConfig): DatabaseDriver {
  const Driver = DriverRegistry[config.type]
  if (!Driver) {
    throw new Error(`Unsupported database type: ${String(config.type)}`)
  }
  return new Driver(config)
}
