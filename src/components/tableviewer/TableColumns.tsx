import { useEffect, useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/store/ipcClient'
import type { AlterColumnAction, ColumnInfo } from '@shared/ipc'
import type { TableTabProps } from './TableViewer'
import styles from './TableColumns.module.css'

interface Edit {
  dataType?: string
  nullable?: boolean
  defaultValue?: string
}
interface AddDraft {
  id: string
  column: string
  dataType: string
  nullable: boolean
  defaultValue: string
}

function keyLabel(c: ColumnInfo): string {
  if (c.isPrimaryKey) return 'PK'
  if (c.isForeignKey) return 'FK'
  return ''
}

// ponytail: comment editing is dialect-specific (COMMENT ON COLUMN / inline);
// shown read-only here. Add per-dialect comment ALTER when needed.
export function TableColumns({ connectionId, database, schema, table, readOnly }: TableTabProps) {
  const [cols, setCols] = useState<ColumnInfo[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<AddDraft[]>([])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function buildActions(): AlterColumnAction[] {
    const actions: AlterColumnAction[] = []
    for (const c of cols) {
      if (dropped.has(c.name)) {
        actions.push({ kind: 'drop', column: c.name })
        continue
      }
      const e = edits[c.name]
      if (e && Object.keys(e).length > 0) {
        actions.push({ kind: 'modify', column: c.name, ...e })
      }
    }
    for (const a of added) {
      if (a.column.trim() && a.dataType.trim()) {
        actions.push({
          kind: 'add',
          column: a.column.trim(),
          dataType: a.dataType.trim(),
          nullable: a.nullable,
          defaultValue: a.defaultValue.trim() || undefined,
        })
      }
    }
    return actions
  }

  const actions = buildActions()

  async function apply(): Promise<void> {
    setConfirming(false)
    const res = await api().table.alterColumn({ connectionId, database, schema, table, actions })
    if (!res.success) {
      setError(res.error)
      return
    }
    discard()
    reload()
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
              { id: crypto.randomUUID(), column: '', dataType: '', nullable: true, defaultValue: '' },
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
              const modified = (e && Object.keys(e).length > 0) || dropped.has(c.name)
              return (
                <tr
                  key={c.name}
                  className={`${modified ? styles.modified : ''} ${dropped.has(c.name) ? styles.droppedRow : ''}`}
                >
                  <td>{i + 1}</td>
                  <td>{c.name}</td>
                  <td>
                    <input
                      className={styles.input}
                      disabled={readOnly || dropped.has(c.name)}
                      value={e?.dataType ?? c.dataType}
                      onChange={(ev) => edit(c.name, { dataType: ev.target.value })}
                    />
                  </td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      disabled={readOnly || dropped.has(c.name)}
                      checked={e?.nullable ?? c.nullable}
                      onChange={(ev) => edit(c.name, { nullable: ev.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.input}
                      disabled={readOnly || dropped.has(c.name)}
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
            {added.map((a, i) => (
              <tr key={a.id} className={styles.added}>
                <td>{cols.length + i + 1}</td>
                <td>
                  <input
                    className={styles.input}
                    placeholder="name"
                    value={a.column}
                    onChange={(ev) =>
                      setAdded((arr) => arr.map((x) => (x.id === a.id ? { ...x, column: ev.target.value } : x)))
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.input}
                    placeholder="type"
                    value={a.dataType}
                    onChange={(ev) =>
                      setAdded((arr) => arr.map((x) => (x.id === a.id ? { ...x, dataType: ev.target.value } : x)))
                    }
                  />
                </td>
                <td className={styles.center}>
                  <input
                    type="checkbox"
                    checked={a.nullable}
                    onChange={(ev) =>
                      setAdded((arr) => arr.map((x) => (x.id === a.id ? { ...x, nullable: ev.target.checked } : x)))
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.input}
                    value={a.defaultValue}
                    onChange={(ev) =>
                      setAdded((arr) => arr.map((x) => (x.id === a.id ? { ...x, defaultValue: ev.target.value } : x)))
                    }
                  />
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
            ))}
          </tbody>
        </table>
      </div>

      {confirming ? (
        <Modal
          title="Apply schema changes"
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
          <p className={styles.confirmText}>Run {actions.length} ALTER TABLE change(s)?</p>
          <ul className={styles.actionList}>
            {actions.map((a, i) => (
              <li key={i}>
                {a.kind === 'drop'
                  ? `DROP COLUMN ${a.column}`
                  : a.kind === 'add'
                    ? `ADD COLUMN ${a.column} ${a.dataType}`
                    : `MODIFY ${a.column}`}
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </div>
  )
}
