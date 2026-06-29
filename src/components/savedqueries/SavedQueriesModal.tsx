import { useEffect, useState } from 'react'
import { IconCheck, IconEdit, IconPlayerPlay, IconTrash, IconX } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { IconButton } from '@/components/ui/IconButton'
import { useUiStore } from '@/store/uiStore'
import { useTabStore } from '@/store/tabStore'
import { useSavedQueryStore, deleteSavedQueryWithUndo } from '@/store/savedQueryStore'
import type { SavedQuery } from '@shared/ipc'
import styles from './SavedQueriesModal.module.css'

const firstLine = (sql: string): string => sql.trim().split('\n')[0]?.trim() ?? ''

export function SavedQueriesModal() {
  const target = useUiStore((s) => s.savedQueriesModal)
  const close = useUiStore((s) => s.closeSavedQueries)
  const showToast = useUiStore((s) => s.showToast)
  const load = useSavedQueryStore((s) => s.load)
  const rename = useSavedQueryStore((s) => s.rename)
  const queries = useSavedQueryStore((s) => s.queries)
  const openQueryTab = useTabStore((s) => s.openQueryTab)

  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    if (target) void load(target.connectionId, target.database)
  }, [target, load])

  if (!target) return null

  const term = search.trim().toLowerCase()
  const list = queries
    .filter((q) => q.connectionId === target.connectionId && q.database === target.database)
    .filter((q) => !term || q.name.toLowerCase().includes(term) || q.sql.toLowerCase().includes(term))

  function open(q: SavedQuery): void {
    openQueryTab({ connectionId: q.connectionId, database: q.database, sql: q.sql, title: q.name, savedQueryId: q.id })
    close()
  }

  function commitRename(id: string): void {
    const name = editValue.trim()
    if (name) void rename(id, name)
    setEditingId(null)
  }

  return (
    <Modal title={`Saved Queries — ${target.database}`} size="lg" onClose={close}>
      <div className={styles.wrap}>
        <input
          className={styles.search}
          placeholder="Search queries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {list.length === 0 ? (
          <p className={styles.empty}>No saved queries yet</p>
        ) : (
          <ul className={styles.list}>
            {list.map((q) => (
              <li key={q.id} className={styles.row}>
                <div className={styles.info}>
                  {editingId === q.id ? (
                    <input
                      className={styles.renameInput}
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(q.id)
                        else if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <>
                      <span className={styles.name}>{q.name}</span>
                      <span className={styles.sql}>{firstLine(q.sql)}</span>
                    </>
                  )}
                  <span className={styles.date}>{q.updatedAt.slice(0, 10)}</span>
                </div>
                <div className={styles.actions}>
                  {editingId === q.id ? (
                    <>
                      <IconButton label="Save name" onClick={() => commitRename(q.id)}>
                        <IconCheck size={15} />
                      </IconButton>
                      <IconButton label="Cancel" onClick={() => setEditingId(null)}>
                        <IconX size={15} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton label="Open" onClick={() => open(q)}>
                        <IconPlayerPlay size={15} />
                      </IconButton>
                      <IconButton
                        label="Rename"
                        onClick={() => {
                          setEditingId(q.id)
                          setEditValue(q.name)
                        }}
                      >
                        <IconEdit size={15} />
                      </IconButton>
                      <IconButton label="Delete" onClick={() => deleteSavedQueryWithUndo(q, showToast)}>
                        <IconTrash size={15} />
                      </IconButton>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
