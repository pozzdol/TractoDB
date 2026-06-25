import { useEffect, useState } from 'react'
import { IconFolder, IconRefresh } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import type { ClientDetection, DetectedClient, NativeClientConfig } from '@shared/ipc'
import styles from './ClientPathModal.module.css'

type ClientKey = 'postgresql' | 'mysql'
const LABELS: Record<ClientKey, { name: string; install: string }> = {
  postgresql: { name: 'PostgreSQL (pg_dump)', install: 'sudo apt install postgresql-client' },
  mysql: { name: 'MySQL (mysqldump)', install: 'sudo apt install mysql-client' },
}

export function ClientPathModal() {
  const close = useUiStore((s) => s.closeClientPath)
  const [detection, setDetection] = useState<ClientDetection | null>(null)
  const [override, setOverride] = useState<NativeClientConfig>({})
  const [saving, setSaving] = useState(false)

  async function detect(): Promise<void> {
    const r = await api().backup.detectClient()
    if (r.success) setDetection(r.data)
  }

  useEffect(() => {
    void detect()
    void api()
      .backup.loadClient()
      .then((r) => {
        if (r.success) setOverride(r.data)
      })
  }, [])

  async function browse(key: ClientKey): Promise<void> {
    const r = await api().dialog.open({
      directory: true,
      title: `Select the ${LABELS[key].name} bin directory`,
    })
    if (r.success && r.data) setOverride((o) => ({ ...o, [key]: r.data }))
  }

  async function save(): Promise<void> {
    setSaving(true)
    await api().backup.saveClient(override)
    await detect()
    setSaving(false)
  }

  function row(key: ClientKey, detected: DetectedClient | undefined) {
    return (
      <div className={styles.row} key={key}>
        <div className={styles.rowHead}>
          <span className={styles.name}>{LABELS[key].name}</span>
          {detected?.found ? (
            <span className={styles.found}>
              found{detected.version ? ` · v${detected.version}` : ''}
            </span>
          ) : (
            <span className={styles.missing}>not found</span>
          )}
        </div>
        <div className={styles.detail}>
          {detected?.found ? detected.path : LABELS[key].install}
        </div>
        <div className={styles.overrideRow}>
          <input
            className={styles.input}
            placeholder="Override bin directory (optional)"
            value={override[key] ?? ''}
            onChange={(e) => setOverride((o) => ({ ...o, [key]: e.target.value }))}
          />
          <Button variant="ghost" onClick={() => void browse(key)} aria-label="Browse">
            <IconFolder size={14} />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Modal
      title="Local Client"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={() => void detect()}>
            <IconRefresh size={14} />
            Re-detect
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <p className={styles.intro}>
        TractoDB uses your installed database client tools for backup and restore.
      </p>
      {row('postgresql', detection?.postgresql)}
      {row('mysql', detection?.mysql)}
    </Modal>
  )
}
