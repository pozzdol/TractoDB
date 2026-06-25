import { ipcMain } from 'electron'
import {
  IPC,
  type AlterColumnAction,
  type AlterColumnRequest,
  type DatabaseType,
  type UpdateCellRequest,
  ipcError,
  ipcSuccess,
} from '../../shared/ipc'
import { connectionManager } from './connection'
import { describeError } from './drivers/base'
import { qualify, quoteId, quoteVal } from './sqlUtil'

const PROD_BLOCKED = 'Blocked: this is a production connection (read-only).'

function assertWritable(connectionId: string): void {
  if (connectionManager.isProduction(connectionId)) throw new Error(PROD_BLOCKED)
}

async function updateCell(req: UpdateCellRequest): Promise<void> {
  assertWritable(req.connectionId)
  const type = connectionManager.getConfig(req.connectionId).type
  const q = qualify(type, req.schema, req.table)
  const sql =
    `UPDATE ${q} SET ${quoteId(type, req.column)} = ${quoteVal(req.value)} ` +
    `WHERE ${quoteId(type, req.pkColumn)} = ${quoteVal(req.pkValue)}`
  await connectionManager.getDriver(req.connectionId).query(sql)
}

function columnDef(type: DatabaseType, action: Extract<AlterColumnAction, { kind: 'add' }>): string {
  const notNull = action.nullable === false ? ' NOT NULL' : ''
  const def =
    action.defaultValue !== undefined && action.defaultValue !== null
      ? ` DEFAULT ${quoteVal(action.defaultValue)}`
      : ''
  return `${quoteId(type, action.column)} ${action.dataType}${notNull}${def}`
}

/** Build the ALTER statements for one action in the given dialect. */
function alterStatements(type: DatabaseType, q: string, action: AlterColumnAction): string[] {
  const col = quoteId(type, action.column)
  if (action.kind === 'add') return [`ALTER TABLE ${q} ADD COLUMN ${columnDef(type, action)}`]
  if (action.kind === 'drop') return [`ALTER TABLE ${q} DROP COLUMN ${col}`]

  // modify
  if (type === 'sqlite') {
    throw new Error('SQLite cannot modify existing columns. Recreate the table instead.')
  }
  if (type === 'mysql') {
    if (!action.dataType) throw new Error('A data type is required to modify a MySQL column.')
    const notNull = action.nullable === false ? ' NOT NULL' : ' NULL'
    const def =
      action.defaultValue !== undefined
        ? action.defaultValue === null
          ? ' DEFAULT NULL'
          : ` DEFAULT ${quoteVal(action.defaultValue)}`
        : ''
    return [`ALTER TABLE ${q} MODIFY COLUMN ${col} ${action.dataType}${notNull}${def}`]
  }
  // postgresql — piecewise
  const stmts: string[] = []
  if (action.dataType) stmts.push(`ALTER TABLE ${q} ALTER COLUMN ${col} TYPE ${action.dataType}`)
  if (action.nullable !== undefined) {
    stmts.push(
      `ALTER TABLE ${q} ALTER COLUMN ${col} ${action.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
    )
  }
  if (action.defaultValue !== undefined) {
    stmts.push(
      action.defaultValue === null
        ? `ALTER TABLE ${q} ALTER COLUMN ${col} DROP DEFAULT`
        : `ALTER TABLE ${q} ALTER COLUMN ${col} SET DEFAULT ${quoteVal(action.defaultValue)}`,
    )
  }
  return stmts
}

async function alterColumn(req: AlterColumnRequest): Promise<string> {
  assertWritable(req.connectionId)
  const type = connectionManager.getConfig(req.connectionId).type
  const q = qualify(type, req.schema, req.table)
  const statements = req.actions.flatMap((a) => alterStatements(type, q, a))
  const driver = connectionManager.getDriver(req.connectionId)
  for (const sql of statements) {
    await driver.query(sql)
  }
  return statements.map((s) => `${s};`).join('\n')
}

export function registerTableWriteHandlers(): void {
  ipcMain.handle(IPC.TABLE.UPDATE_CELL, async (_e, req: UpdateCellRequest) => {
    try {
      await updateCell(req)
      return ipcSuccess(undefined)
    } catch (err) {
      return ipcError(describeError(err))
    }
  })

  ipcMain.handle(IPC.TABLE.ALTER_COLUMN, async (_e, req: AlterColumnRequest) => {
    try {
      return ipcSuccess(await alterColumn(req))
    } catch (err) {
      return ipcError(describeError(err))
    }
  })
}
