import { useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import type { TableRef } from '@/store/tableSelectionStore'
import type { DatabaseType } from '@/types/connection'
import styles from './DeleteTableDialog.module.css'

interface DeleteTableDialogProps {
  connectionId: string
  dbType: DatabaseType
  tables: TableRef[]
  onClose: () => void
  onDone: (dropped: TableRef[]) => void
}

function displayName(dbType: DatabaseType, t: TableRef): string {
  if (dbType === 'mysql') return `\`${t.database}\`.\`${t.name}\``
  return t.schema ? `"${t.schema}"."${t.name}"` : `"${t.name}"`
}

export function DeleteTableDialog({ connectionId, dbType, tables, onClose, onDone }: DeleteTableDialogProps) {
  const single = tables.length === 1
  const target = tables[0]
  const [cascade, setCascade] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const confirmOk = single ? input === target?.name : input === 'DELETE'

  async function onDrop(): Promise<void> {
    setBusy(true)
    setError(null)
    const targets = tables.map((t) => ({ database: t.database, schema: t.schema, name: t.name }))
    const res = await api().schema.dropTables(connectionId, targets, cascade)
    if (!res.success) {
      setError(res.error)
      setBusy(false)
      return
    }
    onDone(tables)
  }

  return (
    <Modal
      title={single ? 'Delete Table' : `Delete ${tables.length} Tables`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!confirmOk || busy} loading={busy} onClick={() => void onDrop()}>
            {single ? 'Drop Table' : `Drop ${tables.length} Tables`}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <IconTrash size={20} className={styles.trash} />
        </div>

        {single ? (
          <>
            <p>
              Are you sure you want to delete <code className={styles.name}>{displayName(dbType, target!)}</code>?
            </p>
            <p className={styles.warn}>
              This will permanently drop the table and all its data. This action cannot be undone.
            </p>
          </>
        ) : (
          <>
            <p>You are about to permanently drop these tables:</p>
            <ul className={styles.list}>
              {tables.map((t) => (
                <li key={`${t.database}/${t.schema ?? ''}/${t.name}`}>
                  <code className={styles.name}>{displayName(dbType, t)}</code>
                </li>
              ))}
            </ul>
            <p className={styles.warn}>
              All data in these tables will be lost. This action cannot be undone.
            </p>
          </>
        )}

        <label className={styles.cascadeBox}>
          <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
          <span>
            CASCADE — also drop dependent objects (views, foreign keys referencing
            {single ? ' this table' : ' these tables'})
          </span>
        </label>
        {cascade ? (
          <p className={styles.cascadeWarn}>
            ⚠ CASCADE will also drop all views, foreign keys, and other objects that depend on
            {single ? ' this table.' : ' these tables.'}
          </p>
        ) : null}

        <label className={styles.confirmField}>
          <span>{single ? `Type the table name to confirm:` : 'Type DELETE to confirm:'}</span>
          <input
            className={styles.confirmInput}
            value={input}
            placeholder={single ? target?.name : 'DELETE'}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmOk && !busy) void onDrop()
            }}
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  )
}
