import type { BackupConfig, BackupFormat, ConnectionConfig, RestoreConfig } from '../../../../shared/ipc'

const FORMAT_FLAG: Record<BackupFormat, string> = {
  plain: 'p',
  custom: 'c',
  tar: 't',
  directory: 'd',
}

function connectionArgs(conn: ConnectionConfig): string[] {
  return [
    '-h',
    conn.host ?? 'localhost',
    '-p',
    String(conn.port ?? 5432),
    '-U',
    conn.username ?? '',
  ]
}

function splitExtra(extraArgs?: string): string[] {
  return extraArgs ? extraArgs.trim().split(/\s+/).filter(Boolean) : []
}

/** pg_dump argument vector. Password is supplied via PGPASSWORD env, never argv. */
export function buildDumpArgs(config: BackupConfig, conn: ConnectionConfig): string[] {
  const format = config.format ?? 'plain'
  const args = [...connectionArgs(conn), '-d', config.database, '-f', config.outputPath]
  args.push('-F', FORMAT_FLAG[format])
  // Only custom/directory support -Z; tar and plain reject it ("compression is
  // not supported by tar archive format").
  if (config.compression !== undefined && (format === 'custom' || format === 'directory')) {
    args.push('-Z', String(config.compression))
  }
  for (const schema of config.schemas ?? []) args.push('-n', schema)
  for (const table of config.tables ?? []) args.push('-t', table)
  if (config.noOwner) args.push('--no-owner')
  if (config.noPrivileges) args.push('--no-privileges')
  if (config.ifExists) args.push('--if-exists')
  args.push('--verbose') // stream progress lines to the UI
  args.push(...splitExtra(config.extraArgs))
  return args
}

/** pg_restore argument vector (custom/tar/directory archives). */
export function buildRestoreArgs(config: RestoreConfig, conn: ConnectionConfig): string[] {
  const args = [...connectionArgs(conn), '-d', config.database]
  if (config.clean) args.push('--clean')
  if (config.ifExists) args.push('--if-exists')
  if (config.noOwner) args.push('--no-owner')
  if (config.noPrivileges) args.push('--no-privileges')
  args.push('--verbose')
  args.push(...splitExtra(config.extraArgs))
  args.push(config.inputPath) // last positional
  return args
}

/** psql argument vector for restoring a plain .sql dump. */
export function buildPsqlRestoreArgs(config: RestoreConfig, conn: ConnectionConfig): string[] {
  return [...connectionArgs(conn), '-d', config.database, '-f', config.inputPath]
}
