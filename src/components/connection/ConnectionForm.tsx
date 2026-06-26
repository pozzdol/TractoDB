import { useState } from 'react'
import { IconFolder } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import { useConnectionStore } from '@/store/connectionStore'
import { databaseTypeMeta } from '@/types/connection'
import { DatabaseIcon, DB_LABELS } from '@/components/ui/DatabaseIcon'
import { DatabaseTypeSelect } from './DatabaseTypeSelect'
import type {
  ConnectionEnvironment,
  ConnectionWithPassword,
  DatabaseMode,
  DatabaseType,
} from '@/types/connection'
import { SSHForm } from './SSHForm'
import styles from './ConnectionForm.module.css'

interface FormState {
  name: string
  type: DatabaseType
  host: string
  port: string
  database: string
  username: string
  password: string
  filePath: string
  ssl: boolean
  databaseMode: DatabaseMode
  environment: ConnectionEnvironment
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string }

function initialForm(editId: string | null): FormState {
  const existing = editId
    ? useConnectionStore.getState().connections.find((c) => c.config.id === editId)?.config
    : undefined
  const type = existing?.type ?? 'postgresql'
  return {
    name: existing?.name ?? '',
    type,
    host: existing?.host ?? '',
    port: existing?.port !== undefined ? String(existing.port) : String(databaseTypeMeta(type).defaultPort ?? ''),
    database: existing?.database ?? '',
    username: existing?.username ?? '',
    password: '', // never pre-filled — left blank keeps the stored password on edit
    filePath: existing?.filePath ?? '',
    ssl: existing?.ssl ?? false,
    databaseMode: existing?.databaseMode ?? 'single', // default: specific db (less noise)
    environment: existing?.environment ?? 'development',
  }
}

export function ConnectionForm() {
  const editId = useUiStore((s) => s.connectionForm.editId)
  const defaultFolderId = useUiStore((s) => s.connectionForm.defaultFolderId)
  const close = useUiStore((s) => s.closeConnectionForm)
  const saveConnection = useConnectionStore((s) => s.saveConnection)
  const testConnection = useConnectionStore((s) => s.testConnection)

  const [form, setForm] = useState<FormState>(() => initialForm(editId))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)

  const meta = databaseTypeMeta(form.type)
  // Only pg/mysql can list multiple databases; SQLite/Redis are always single.
  const supportsDbToggle = form.type === 'postgresql' || form.type === 'mysql'
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((f) => ({ ...f, [key]: value }))
    setTest({ status: 'idle' })
  }

  function changeType(type: DatabaseType): void {
    const m = databaseTypeMeta(type)
    setForm((f) => ({ ...f, type, port: String(m.defaultPort ?? '') }))
    setTest({ status: 'idle' })
  }

  function validate(): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (meta.usesFile && !form.filePath.trim()) e.filePath = 'Database file is required.'
    if (meta.usesHostPort) {
      if (!form.host.trim()) e.host = 'Host is required.'
      const port = Number(form.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) e.port = 'Port must be 1–65535.'
    }
    if (meta.usesUsername && !form.username.trim()) e.username = 'Username is required.'
    return e
  }

  function buildConfig(): ConnectionWithPassword {
    const existing = editId
      ? useConnectionStore.getState().connections.find((c) => c.config.id === editId)?.config
      : undefined
    return {
      id: editId ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      host: meta.usesHostPort ? form.host.trim() : undefined,
      port: meta.usesHostPort ? Number(form.port) : undefined,
      database:
        meta.usesDatabase && (!supportsDbToggle || form.databaseMode === 'single')
          ? form.database.trim() || undefined
          : undefined,
      username: meta.usesUsername ? form.username.trim() || undefined : undefined,
      filePath: meta.usesFile ? form.filePath.trim() : undefined,
      ssl: meta.usesHostPort ? form.ssl : undefined,
      databaseMode: supportsDbToggle ? form.databaseMode : 'single',
      environment: form.environment,
      password: form.password || undefined,
      // Preserve folder on edit; place new connections in the requested folder.
      folderId: existing ? (existing.folderId ?? null) : (defaultFolderId ?? null),
      order: existing?.order ?? 0,
      createdAt: existing?.createdAt ?? '',
      updatedAt: '',
    }
  }

  // Show the database name field for redis (always), or pg/mysql in single mode.
  const showDatabaseInput = meta.usesDatabase && (!supportsDbToggle || form.databaseMode === 'single')

  async function handleTest(): Promise<void> {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setTest({ status: 'testing' })
    try {
      await testConnection(buildConfig())
      setTest({ status: 'ok', message: 'Connection successful.' })
    } catch (err) {
      setTest({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleSave(): Promise<void> {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSaving(true)
    try {
      await saveConnection(buildConfig())
      close()
    } catch (err) {
      setSaving(false)
      setTest({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function pickFile(): Promise<void> {
    const r = await api().dialog.open({
      title: 'Select SQLite database file',
      filters: [
        { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (r.success && r.data) set('filePath', r.data)
  }

  return (
    <Modal
      title={editId ? 'Edit Connection' : 'New Connection'}
      size="md"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" loading={test.status === 'testing'} onClick={() => void handleTest()}>
            Test Connection
          </Button>
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.headerRow}>
          <DatabaseIcon type={form.type} size={24} />
          <span className={styles.headerLabel}>{DB_LABELS[form.type]}</span>
        </div>

        <Input
          label="Name"
          value={form.name}
          error={errors.name}
          placeholder="My database"
          onChange={(e) => set('name', e.target.value)}
        />

        <label className={styles.field}>
          <span className={styles.label}>Type</span>
          <DatabaseTypeSelect value={form.type} onChange={changeType} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Environment</span>
          <select
            className={styles.select}
            value={form.environment}
            onChange={(e) => set('environment', e.target.value as ConnectionEnvironment)}
          >
            <option value="development">Development</option>
            <option value="production">Production</option>
          </select>
        </label>

        {form.environment === 'production' ? (
          <div className={styles.prodWarning}>
            Production connections are read-only. INSERT, UPDATE, DELETE, DROP, and DDL
            operations will be blocked.
          </div>
        ) : null}

        {meta.usesFile ? (
          <Input
            label="Database file"
            value={form.filePath}
            error={errors.filePath}
            placeholder="/path/to/database.db"
            onChange={(e) => set('filePath', e.target.value)}
            trailing={
              <Button variant="secondary" onClick={() => void pickFile()} aria-label="Browse">
                <IconFolder size={14} />
              </Button>
            }
          />
        ) : null}

        {meta.usesHostPort ? (
          <div className={styles.row}>
            <div className={styles.hostCol}>
              <Input
                label="Host"
                value={form.host}
                error={errors.host}
                placeholder="localhost"
                onChange={(e) => set('host', e.target.value)}
              />
            </div>
            <div className={styles.portCol}>
              <Input
                label="Port"
                value={form.port}
                error={errors.port}
                inputMode="numeric"
                onChange={(e) => set('port', e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {supportsDbToggle ? (
          <div className={styles.field}>
            <span className={styles.label}>Databases</span>
            <div className={styles.radioRow}>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="databaseMode"
                  checked={form.databaseMode === 'single'}
                  onChange={() => set('databaseMode', 'single')}
                />
                <span>Specific database</span>
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="databaseMode"
                  checked={form.databaseMode === 'all'}
                  onChange={() => set('databaseMode', 'all')}
                />
                <span>All databases</span>
              </label>
            </div>
          </div>
        ) : null}

        {showDatabaseInput ? (
          <Input
            label={form.type === 'redis' ? 'Database index' : 'Database'}
            value={form.database}
            placeholder={form.type === 'redis' ? '0' : 'database name'}
            onChange={(e) => set('database', e.target.value)}
          />
        ) : null}

        {meta.usesUsername ? (
          <Input
            label="Username"
            value={form.username}
            error={errors.username}
            onChange={(e) => set('username', e.target.value)}
          />
        ) : null}

        {meta.usesPassword ? (
          <Input
            label={editId ? 'Password (leave blank to keep current)' : 'Password'}
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        ) : null}

        {meta.usesHostPort ? (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.ssl} onChange={(e) => set('ssl', e.target.checked)} />
            <span>Use SSL/TLS</span>
          </label>
        ) : null}

        {test.status === 'ok' ? (
          <p className={styles.ok}>{test.message}</p>
        ) : test.status === 'error' ? (
          <p className={styles.err}>{test.message}</p>
        ) : null}

        <SSHForm />
      </div>
    </Modal>
  )
}
