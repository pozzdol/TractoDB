import { useState } from 'react'
import { IconDeviceFloppy, IconDownload, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { DatabaseIcon } from '@/components/ui/DatabaseIcon'
import { useSavedQueryStore } from '@/store/savedQueryStore'
import { useUiStore } from '@/store/uiStore'
import type { DatabaseType } from '@/types/connection'
import type { QueryStatus } from '@/store/queryStore'
import styles from './QueryToolbar.module.css'

interface QueryToolbarProps {
  connectionName?: string
  database?: string | null
  dbType?: DatabaseType
  status: QueryStatus
  canRun: boolean
  readOnly?: boolean
  onRun: () => void
  onStop: () => void
  // Saved queries (BUG 6)
  sql: string
  connectionId?: string | null
  savedQueryId?: string
  savedQueryName?: string
  /** Called after a brand-new save with the new id + chosen name. */
  onSaved: (savedQueryId: string, name: string) => void
}

export function QueryToolbar({
  connectionName,
  database,
  dbType,
  status,
  canRun,
  readOnly = false,
  onRun,
  onStop,
  sql,
  connectionId,
  savedQueryId,
  savedQueryName,
  onSaved,
}: QueryToolbarProps) {
  const running = status === 'running'
  const save = useSavedQueryStore((s) => s.save)
  const showToast = useUiStore((s) => s.showToast)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [name, setName] = useState('')

  const canSave = !!connectionId && !!database && sql.trim().length > 0

  function openPopover(): void {
    setName(sql.trim().split('\n')[0]?.trim().slice(0, 50) || 'Untitled query')
    setPopoverOpen(true)
  }

  async function saveNew(): Promise<void> {
    if (!connectionId || !database) return
    const label = name.trim()
    if (!label) return
    const saved = await save({
      id: crypto.randomUUID(),
      name: label,
      sql,
      connectionId,
      database,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setPopoverOpen(false)
    onSaved(saved.id, saved.name)
    showToast(`Query saved as '${saved.name}'`)
  }

  async function update(): Promise<void> {
    if (!connectionId || !database || !savedQueryId) return
    await save({
      id: savedQueryId,
      name: savedQueryName ?? 'Query',
      sql,
      connectionId,
      database,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    showToast('Query updated')
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {connectionName ? (
          <span className={`${styles.badge} ${readOnly ? styles.badgeProd : ''}`}>
            {dbType ? <DatabaseIcon type={dbType} size={13} className={styles.badgeIcon} /> : null}
            {connectionName}
            {database ? <span className={styles.schema}>/{database}</span> : null}
            {readOnly ? <span className={styles.prodTag}>PROD</span> : null}
          </span>
        ) : (
          <span className={styles.noConn}>No connection</span>
        )}
      </div>
      <div className={styles.right}>
        {running ? (
          <Button variant="danger" onClick={onStop}>
            <IconPlayerStop size={14} />
            Stop
          </Button>
        ) : (
          <Button variant="primary" disabled={!canRun} onClick={onRun}>
            <IconPlayerPlay size={14} />
            Run
          </Button>
        )}

        <div className={styles.saveWrap}>
          {savedQueryId ? (
            <Button variant="secondary" disabled={!canSave} onClick={() => void update()}>
              <IconDeviceFloppy size={14} />
              Update Query
            </Button>
          ) : (
            <Button variant="secondary" disabled={!canSave} onClick={openPopover}>
              <IconDeviceFloppy size={14} />
              Save Query
            </Button>
          )}
          {popoverOpen ? (
            <div className={styles.popover} role="dialog" aria-label="Save Query">
              <span className={styles.popTitle}>Save Query</span>
              <input
                className={styles.popInput}
                value={name}
                autoFocus
                placeholder="Query name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNew()
                  else if (e.key === 'Escape') setPopoverOpen(false)
                }}
              />
              <div className={styles.popActions}>
                <Button variant="ghost" onClick={() => setPopoverOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={!name.trim()} onClick={() => void saveNew()}>
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <IconButton label="Export (coming in v2)" disabled>
          <IconDownload size={16} />
        </IconButton>
      </div>
    </div>
  )
}
