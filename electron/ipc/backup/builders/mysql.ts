import type { BackupConfig, ConnectionConfig, RestoreConfig } from '../../../../shared/ipc'

function connectionArgs(conn: ConnectionConfig): string[] {
  return [
    '-h',
    conn.host ?? 'localhost',
    '-P',
    String(conn.port ?? 3306),
    '-u',
    conn.username ?? '',
  ]
}

function splitExtra(extraArgs?: string): string[] {
  return extraArgs ? extraArgs.trim().split(/\s+/).filter(Boolean) : []
}

/** mysqldump argument vector. Password is supplied via MYSQL_PWD env, never argv. */
export function buildDumpArgs(config: BackupConfig, conn: ConnectionConfig): string[] {
  const args = [...connectionArgs(conn)]
  if (config.singleTransaction !== false) args.push('--single-transaction')
  if (config.routines) args.push('--routines')
  if (config.triggers) args.push('--triggers')
  if (config.dataOnly) args.push('--no-create-info')
  if (config.schemaOnly) args.push('--no-data')
  args.push(`--result-file=${config.outputPath}`)
  args.push(config.database)
  for (const table of config.tables ?? []) args.push(table)
  args.push(...splitExtra(config.extraArgs))
  return args
}

/**
 * mysql (client) argument vector for restore. The dump file is streamed to the
 * process's stdin by the caller — it is NOT passed as an argument.
 */
export function buildRestoreArgs(config: RestoreConfig, conn: ConnectionConfig): string[] {
  const args = [...connectionArgs(conn), config.database]
  args.push(...splitExtra(config.extraArgs))
  return args
}
