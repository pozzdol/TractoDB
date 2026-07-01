import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/store/ipcClient'
import { qualifiedName, quoteIdent } from '@/lib/sqlIdent'
import { buildTypeString, lengthKind, typeGroupsFor } from '@/lib/columnTypeCatalog'
import { parseColumnType } from '@/lib/parseColumnType'
import type { AlterColumnAction, ColumnInfo } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import { TypeSelect } from './TypeSelect'
import styles from './PropertiesColumns.module.css'

interface Edit {
  baseType?: string
  length?: string
  precision?: string
  scale?: string
  nullable?: boolean
  defaultValue?: string
}
interface AddDraft {
  id: string
  column: string
  baseType: string
  length: string
  precision: string
  scale: string
  nullable: boolean
  defaultValue: string
}

function keyLabel(c: ColumnInfo): string {
  if (c.isPrimaryKey) return 'PK'
  if (c.isForeignKey) return 'FK'
  return ''
}

function sqlLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

// ponytail: comment editing is dialect-specific; shown read-only here.
export function PropertiesColumns({
  connectionId,
  database,
  schema,
  table,
  dbType,
  readOnly,
}: TableTabProps) {
  const [cols, setCols] = useState<ColumnInfo[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<AddDraft[]>([])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lenRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const groups = typeGroupsFor(dbType)

  function reload(): void {
    void api()
      .schema.listColumns(connectionId, database, schema ? `${schema}.${table}` : table)
      .then((r) => {
        if (r.success) setCols(r.data)
      })
  }
  useEffect(reload, [connectionId, database, schema, table])

  function discard(): void {
    setEdits({})
    setDropped(new Set())
    setAdded([])
    setError(null)
  }

  function edit(name: string, patch: Edit): void {
    setEdits((e) => ({ ...e, [name]: { ...e[name], ...patch } }))
  }

  /** After choosing a length-bearing type, focus its Length cell. */
  function focusLen(key: string): void {
    setTimeout(() => lenRefs.current[key]?.focus(), 0)
  }

  // Current type parts for an existing column (edit overlaid on parsed original).
  function partsOf(c: ColumnInfo): { base: string; length: string; precision: string; scale: string; isArray: boolean } {
    const p = parseColumnType(c.dataType)
    const e = edits[c.name] ?? {}
    return {
      base: e.baseType ?? p.baseType,
      length: e.length ?? (p.length?.toString() ?? ''),
      precision: e.precision ?? (p.precision?.toString() ?? ''),
      scale: e.scale ?? (p.scale?.toString() ?? ''),
      isArray: p.isArray,
    }
  }

  function buildActions(): AlterColumnAction[] {
    const actions: AlterColumnAction[] = []
    for (const c of cols) {
      if (dropped.has(c.name)) {
        actions.push({ kind: 'drop', column: c.name })
        continue
      }
      const e = edits[c.name]
      if (!e || Object.keys(e).length === 0) continue
      const cur = partsOf(c)
      const built = buildTypeString({ baseType: cur.base, length: cur.length, precision: cur.precision, scale: cur.scale, isArray: cur.isArray })
      const p = parseColumnType(c.dataType)
      const origBuilt = buildTypeString({ baseType: p.baseType, length: p.length?.toString() ?? '', precision: p.precision?.toString() ?? '', scale: p.scale?.toString() ?? '', isArray: p.isArray })
      const typeChanged =
        (e.baseType !== undefined || e.length !== undefined || e.precision !== undefined || e.scale !== undefined) &&
        built !== origBuilt
      if (!typeChanged && e.nullable === undefined && e.defaultValue === undefined) continue
      actions.push({
        kind: 'modify',
        column: c.name,
        ...(typeChanged ? { dataType: built } : {}),
        ...(e.nullable !== undefined ? { nullable: e.nullable } : {}),
        ...(e.defaultValue !== undefined ? { defaultValue: e.defaultValue } : {}),
      })
    }
    for (const a of added) {
      if (a.column.trim() && a.baseType.trim()) {
        actions.push({
          kind: 'add',
          column: a.column.trim(),
          dataType: buildTypeString({ baseType: a.baseType, length: a.length, precision: a.precision, scale: a.scale }),
          nullable: a.nullable,
          defaultValue: a.defaultValue.trim() || undefined,
        })
      }
    }
    return actions
  }

  const actions = buildActions()
  // SQLite cannot ALTER a column type — a type change forces a table recreate.
  const needsSqliteRecreate = dbType === 'sqlite' && actions.some((a) => a.kind === 'modify' && a.dataType)

  /** Build the SQLite recreate script (BUG 12 Part C). */
  function sqliteRecreateScript(): string[] {
    const qt = qualifiedName(dbType, schema, table)
    const tmp = quoteIdent(dbType, `_new_${table}`)
    const kept = cols.filter((c) => !dropped.has(c.name))
    const colDef = (name: string, typeStr: string, nullable: boolean, isPk: boolean, def?: string): string => {
      const parts = [`${quoteIdent(dbType, name)} ${typeStr}`]
      if (isPk) parts.push('PRIMARY KEY')
      if (!nullable) parts.push('NOT NULL')
      if (def) parts.push(`DEFAULT ${sqlLiteral(def)}`)
      return `  ${parts.join(' ')}`
    }
    const defs: string[] = []
    for (const c of kept) {
      const cur = partsOf(c)
      const e = edits[c.name] ?? {}
      defs.push(
        colDef(
          c.name,
          buildTypeString({ baseType: cur.base, length: cur.length, precision: cur.precision, scale: cur.scale, isArray: cur.isArray }),
          e.nullable ?? c.nullable,
          c.isPrimaryKey,
          e.defaultValue ?? c.defaultValue,
        ),
      )
    }
    for (const a of added) {
      if (a.column.trim() && a.baseType.trim()) {
        defs.push(colDef(a.column.trim(), buildTypeString({ baseType: a.baseType, length: a.length, precision: a.precision, scale: a.scale }), a.nullable, false, a.defaultValue.trim() || undefined))
      }
    }
    const keptCols = kept.map((c) => quoteIdent(dbType, c.name)).join(', ')
    return [
      'BEGIN TRANSACTION;',
      `CREATE TABLE ${tmp} (\n${defs.join(',\n')}\n);`,
      `INSERT INTO ${tmp} (${keptCols}) SELECT ${keptCols} FROM ${qt};`,
      `DROP TABLE ${qt};`,
      `ALTER TABLE ${tmp} RENAME TO ${quoteIdent(dbType, table)};`,
      'COMMIT;',
    ]
  }

  async function apply(): Promise<void> {
    setConfirming(false)
    if (needsSqliteRecreate) {
      const stmts = sqliteRecreateScript()
      for (const stmt of stmts) {
        const res = await api().query.execute(connectionId, stmt, database)
        if (!res.success) {
          await api().query.execute(connectionId, 'ROLLBACK', database).catch(() => undefined)
          setError(res.error)
          return
        }
      }
      discard()
      reload()
      return
    }
    const res = await api().table.alterColumn({ connectionId, database, schema, table, actions })
    if (!res.success) {
      setError(res.error)
      return
    }
    discard()
    reload()
  }

  function lengthCell(
    key: string,
    kind: ReturnType<typeof lengthKind>,
    len: string,
    prec: string,
    scale: string,
    disabled: boolean,
    onLen: (v: string) => void,
    onPrec: (v: string) => void,
    onScale: (v: string) => void,
  ): ReactNode {
    if (kind === 'none') {
      return (
        <span className={styles.noLen} title="This type does not support length">
          —
        </span>
      )
    }
    if (kind === 'precision') {
      return (
        <span className={styles.precPair} title="Precision, Scale">
          <input
            ref={(el) => (lenRefs.current[key] = el)}
            className={styles.lenInput}
            type="number"
            disabled={disabled}
            value={prec}
            onChange={(e) => onPrec(e.target.value)}
          />
          <input
            className={styles.lenInput}
            type="number"
            disabled={disabled}
            value={scale}
            onChange={(e) => onScale(e.target.value)}
          />
        </span>
      )
    }
    return (
      <input
        ref={(el) => (lenRefs.current[key] = el)}
        className={styles.lenInput}
        type="number"
        disabled={disabled}
        value={len}
        onChange={(e) => onLen(e.target.value)}
      />
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          disabled={readOnly}
          onClick={() =>
            setAdded((a) => [
              ...a,
              { id: crypto.randomUUID(), column: '', baseType: '', length: '', precision: '', scale: '', nullable: true, defaultValue: '' },
            ])
          }
        >
          Add Column
        </Button>
        <span className={styles.spacer} />
        {actions.length > 0 ? (
          <>
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
            <Button variant="primary" disabled={readOnly} onClick={() => setConfirming(true)}>
              Apply Changes ({actions.length})
            </Button>
          </>
        ) : null}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Data Type</th>
              <th className={styles.lenHead}>Length / Precision</th>
              <th>Nullable</th>
              <th>Default</th>
              <th>Key</th>
              <th>Comment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cols.map((c, i) => {
              const e = edits[c.name]
              const isDropped = dropped.has(c.name)
              const modified = (e && Object.keys(e).length > 0) || isDropped
              const cur = partsOf(c)
              const kind = lengthKind(cur.base)
              const disabled = readOnly || isDropped
              return (
                <tr
                  key={c.name}
                  className={`${modified ? styles.modified : ''} ${isDropped ? styles.droppedRow : ''}`}
                >
                  <td>{i + 1}</td>
                  <td>{c.name}</td>
                  <td>
                    <TypeSelect
                      value={cur.base}
                      groups={groups}
                      disabled={disabled}
                      onSelect={(t) => {
                        edit(c.name, { baseType: t, length: '', precision: '', scale: '' })
                        if (lengthKind(t) !== 'none') focusLen(c.name)
                      }}
                    />
                  </td>
                  <td>
                    {lengthCell(
                      c.name,
                      kind,
                      cur.length,
                      cur.precision,
                      cur.scale,
                      disabled,
                      (v) => edit(c.name, { length: v }),
                      (v) => edit(c.name, { precision: v }),
                      (v) => edit(c.name, { scale: v }),
                    )}
                  </td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={e?.nullable ?? c.nullable}
                      onChange={(ev) => edit(c.name, { nullable: ev.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.input}
                      disabled={disabled}
                      value={e?.defaultValue ?? c.defaultValue ?? ''}
                      onChange={(ev) => edit(c.name, { defaultValue: ev.target.value })}
                    />
                  </td>
                  <td className={styles.center}>{keyLabel(c)}</td>
                  <td className={styles.comment}>{c.comment ?? ''}</td>
                  <td className={styles.center}>
                    <button
                      type="button"
                      className={styles.drop}
                      aria-label={`Drop ${c.name}`}
                      disabled={readOnly}
                      onClick={() =>
                        setDropped((d) => {
                          const next = new Set(d)
                          if (next.has(c.name)) next.delete(c.name)
                          else next.add(c.name)
                          return next
                        })
                      }
                    >
                      <IconTrash size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {added.map((a, i) => {
              const kind = lengthKind(a.baseType)
              const patch = (p: Partial<AddDraft>): void =>
                setAdded((arr) => arr.map((x) => (x.id === a.id ? { ...x, ...p } : x)))
              return (
                <tr key={a.id} className={styles.added}>
                  <td>{cols.length + i + 1}</td>
                  <td>
                    <input
                      className={styles.input}
                      placeholder="name"
                      value={a.column}
                      onChange={(ev) => patch({ column: ev.target.value })}
                    />
                  </td>
                  <td>
                    <TypeSelect
                      value={a.baseType}
                      groups={groups}
                      onSelect={(t) => {
                        patch({ baseType: t, length: '', precision: '', scale: '' })
                        if (lengthKind(t) !== 'none') focusLen(a.id)
                      }}
                    />
                  </td>
                  <td>
                    {lengthCell(
                      a.id,
                      kind,
                      a.length,
                      a.precision,
                      a.scale,
                      false,
                      (v) => patch({ length: v }),
                      (v) => patch({ precision: v }),
                      (v) => patch({ scale: v }),
                    )}
                  </td>
                  <td className={styles.center}>
                    <input type="checkbox" checked={a.nullable} onChange={(ev) => patch({ nullable: ev.target.checked })} />
                  </td>
                  <td>
                    <input className={styles.input} value={a.defaultValue} onChange={(ev) => patch({ defaultValue: ev.target.value })} />
                  </td>
                  <td />
                  <td />
                  <td className={styles.center}>
                    <button
                      type="button"
                      className={styles.drop}
                      aria-label="Remove new column"
                      onClick={() => setAdded((arr) => arr.filter((x) => x.id !== a.id))}
                    >
                      <IconTrash size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirming ? (
        <Modal
          title="Review Changes"
          size="md"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void apply()}>
                Apply
              </Button>
            </>
          }
        >
          {needsSqliteRecreate ? (
            <>
              <p className={styles.warn}>
                ⚠ SQLite does not support changing column types directly. To change the type, the
                table must be recreated. The following SQL recreates the table with the new column
                type:
              </p>
              <pre className={styles.script}>{sqliteRecreateScript().join('\n')}</pre>
            </>
          ) : (
            <>
              <p className={styles.confirmText}>Run {actions.length} ALTER TABLE change(s)?</p>
              <ul className={styles.actionList}>
                {actions.map((a, i) => (
                  <li key={i}>
                    {a.kind === 'drop'
                      ? `DROP COLUMN ${a.column}`
                      : a.kind === 'add'
                        ? `ADD COLUMN ${a.column} ${a.dataType}`
                        : `MODIFY ${a.column}${a.dataType ? ` TYPE ${a.dataType}` : ''}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
