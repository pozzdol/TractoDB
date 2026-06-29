import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useConnectionStore } from '@/store/connectionStore'
import { useUiStore } from '@/store/uiStore'
import styles from './ConnectionErrorModal.module.css'

export function ConnectionErrorModal() {
  const [copied, setCopied] = useState(false)
  const connectionId = useUiStore((s) => s.connectionErrorId)
  const dismiss = useUiStore((s) => s.dismissConnectionError)
  const openConnectionForm = useUiStore((s) => s.openConnectionForm)
  const conn = useConnectionStore((s) =>
    connectionId ? s.connections.find((c) => c.config.id === connectionId) : undefined,
  )

  if (!connectionId || !conn) return null
  const { config } = conn
  const message = conn.errorMessage ?? 'Connection failed.'

  // SQLite has no host/port/user — show the file path instead.
  const details: { label: string; value: string }[] =
    config.type === 'sqlite'
      ? [{ label: 'File', value: config.filePath ?? '' }]
      : [
          { label: 'Host', value: config.host ?? '' },
          { label: 'Port', value: config.port !== undefined ? String(config.port) : '' },
          { label: 'Database', value: config.database ?? '' },
          { label: 'User', value: config.username ?? '' },
        ]

  const fullError =
    `TractoDB Connection Error\n` +
    `Date: ${new Date().toISOString()}\n` +
    `Connection: ${config.name}\n` +
    (config.type === 'sqlite'
      ? `File: ${config.filePath ?? ''}\n`
      : `Host: ${config.host ?? ''}:${config.port ?? ''}\n` +
        `Database: ${config.database ?? ''}\n` +
        `User: ${config.username ?? ''}\n`) +
    `\nError: ${message}`

  function copyError(): void {
    void navigator.clipboard.writeText(fullError)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function editConnection(): void {
    dismiss()
    openConnectionForm(connectionId)
  }

  return (
    <Modal
      title="Connection Failed"
      size="md"
      onClose={dismiss}
      footer={
        <>
          <Button variant="ghost" onClick={copyError}>
            {copied ? 'Copied!' : 'Copy Error'}
          </Button>
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={editConnection}>
            Edit Connection
          </Button>
          <Button variant="primary" onClick={dismiss}>
            Close
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <IconAlertTriangle size={20} className={styles.icon} />
          <span>
            Could not connect to <strong>{config.name}</strong>
          </span>
        </div>

        <p className={styles.message}>{message}</p>

        <dl className={styles.details}>
          {details.map((d) => (
            <div key={d.label} className={styles.row}>
              <dt className={styles.label}>{d.label}</dt>
              <dd className={styles.value}>{d.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}
