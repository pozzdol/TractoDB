import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import { useBackup } from '@/hooks/useBackup'
import type { BackupConfig, BackupFormat, ClientDetection, TableInfo } from '@shared/ipc'
import { ProgressLog } from './ProgressLog'
import styles from './Wizard.module.css'

const PG_FORMATS: { value: BackupFormat; label: string; ext: string }[] = [
  { value: 'plain', label: 'Plain SQL', ext: 'sql' },
  { value: 'custom', label: 'Custom', ext: 'dump' },
  { value: 'tar', label: 'Tar', ext: 'tar' },
  { value: 'directory', label: 'Directory', ext: 'dir' },
]

interface Options {
  format: BackupFormat
  compression: number
  noOwner: boolean
  noPrivileges: boolean
  ifExists: boolean
  singleTransaction: boolean
  routines: boolean
  triggers: boolean
  dataOnly: boolean
  schemaOnly: boolean
  extraArgs: string
}

const DEFAULT_OPTIONS: Options = {
  format: 'plain',
  compression: 6,
  noOwner: false,
  noPrivileges: false,
  ifExists: false,
  singleTransaction: true,
  routines: true,
  triggers: true,
  dataOnly: false,
  schemaOnly: false,
  extraArgs: '',
}

function formatBytes(n: number | null): string {
  if (n === null || n < 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(1)} ${units[i]}`
}

export function BackupWizard() {
  const target = useUiStore((s) => s.backupModal?.target)
  const close = useUiStore((s) => s.closeBackupModal)
  const openClientPath = useUiStore((s) => s.openClientPath)
  const { lines, isRunning, exitCode, bytes, startBackup, cancel } = useBackup()

  const [step, setStep] = useState(target?.allTables ? 2 : 1)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [outputPath, setOutputPath] = useState('')
  const [detection, setDetection] = useState<ClientDetection | null>(null)

  const isPg = target?.databaseType === 'postgresql'

  useEffect(() => {
    if (!target) return
    const pg = target.databaseType === 'postgresql'
    const keyOf = (t: TableInfo): string => (pg && t.schema ? `${t.schema}.${t.name}` : t.name)
    void api()
      .schema.listTables(target.connectionId, target.database)
      .then((r) => {
        if (!r.success) return
        setTables(r.data)
        // "Backup All Tables" pre-selects everything.
        if (target.allTables) setSelected(new Set(r.data.map(keyOf)))
      })
    void api()
      .backup.detectClient()
      .then((r) => {
        if (r.success) setDetection(r.data)
      })
  }, [target])

  if (!target) return null

  const tableKey = (t: TableInfo): string =>
    isPg && t.schema ? `${t.schema}.${t.name}` : t.name

  const allKeys = tables.map(tableKey)
  const allChecked = tables.length > 0 && selected.size === tables.length
  const someChecked = selected.size > 0 && selected.size < tables.length
  const tableCount = selected.size > 0 ? selected.size : tables.length
  const summary = `Starting backup of ${tableCount} tables in database '${target.database}'...`
  const completion =
    exitCode === 0
      ? `✓ Backup complete — ${tableCount} tables — output: ${outputPath} (${formatBytes(bytes)})`
      : undefined

  function toggleAll(): void {
    setSelected(allChecked ? new Set() : new Set(allKeys))
  }

  function toggle(key: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function chooseOutput(): Promise<void> {
    const fmt = PG_FORMATS.find((f) => f.value === options.format)
    const ext = isPg ? (fmt?.ext ?? 'sql') : 'sql'
    const r = await api().dialog.save({
      title: 'Save backup as',
      defaultPath: `${target!.database}.${ext}`,
    })
    if (r.success && r.data) setOutputPath(r.data)
  }

  function start(): void {
    const tablesList = [...selected]
    const config: BackupConfig = {
      connectionId: target!.connectionId,
      databaseType: target!.databaseType,
      database: target!.database,
      tables: tablesList,
      outputPath,
      extraArgs: options.extraArgs,
      ...(isPg
        ? {
            format: options.format,
            compression: options.compression as BackupConfig['compression'],
            noOwner: options.noOwner,
            noPrivileges: options.noPrivileges,
            ifExists: options.ifExists,
          }
        : {
            singleTransaction: options.singleTransaction,
            routines: options.routines,
            triggers: options.triggers,
            dataOnly: options.dataOnly,
            schemaOnly: options.schemaOnly,
          }),
    }
    setStep(4)
    void startBackup(config)
  }

  const set = <K extends keyof Options>(key: K, value: Options[K]): void =>
    setOptions((o) => ({ ...o, [key]: value }))

  const detected = isPg ? detection?.postgresql : detection?.mysql

  return (
    <Modal
      title={`Backup — ${target.database}`}
      size="lg"
      onClose={close}
      footer={
        step < 4 ? (
          <>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 3 && (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
            {step === 3 && (
              <Button variant="primary" disabled={!outputPath} onClick={start}>
                Start backup
              </Button>
            )}
          </>
        ) : (
          <>
            {isRunning ? (
              <Button variant="danger" onClick={() => void cancel()}>
                Cancel
              </Button>
            ) : (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            )}
          </>
        )
      }
    >
      <p className={styles.stepHead}>Step {step} of 4</p>

      {step === 1 && (
        <div>
          <p className={styles.hint}>Leave everything unchecked to back up the whole database.</p>
          <div className={styles.checkList}>
            {tables.length > 0 ? (
              <label className={`${styles.checkItem} ${styles.selectAll}`}>
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked
                  }}
                  checked={allChecked}
                  onChange={toggleAll}
                />
                <span>Select All Tables</span>
              </label>
            ) : null}
            {tables.length === 0 ? (
              <p className={styles.muted}>No tables found.</p>
            ) : (
              tables.map((t) => {
                const key = tableKey(t)
                return (
                  <label key={key} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                    />
                    <span>{key}</span>
                    <span className={styles.tag}>{t.type}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.options}>
          {target.allTables ? (
            <p className={styles.allHeader}>Backing up all tables in {target.database}</p>
          ) : null}
          {isPg ? (
            <>
              <label className={styles.field}>
                <span>Format</span>
                <select
                  value={options.format}
                  onChange={(e) => set('format', e.target.value as BackupFormat)}
                >
                  {PG_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Compression ({options.compression})</span>
                <input
                  type="range"
                  min={0}
                  max={9}
                  value={options.compression}
                  disabled={options.format === 'plain' || options.format === 'directory'}
                  onChange={(e) => set('compression', Number(e.target.value))}
                />
              </label>
              <Check label="No owner" v={options.noOwner} on={(b) => set('noOwner', b)} />
              <Check label="No privileges" v={options.noPrivileges} on={(b) => set('noPrivileges', b)} />
              <Check label="Include IF EXISTS" v={options.ifExists} on={(b) => set('ifExists', b)} />
            </>
          ) : (
            <>
              <Check label="Single transaction" v={options.singleTransaction} on={(b) => set('singleTransaction', b)} />
              <Check label="Include routines" v={options.routines} on={(b) => set('routines', b)} />
              <Check label="Include triggers" v={options.triggers} on={(b) => set('triggers', b)} />
              <Check label="Data only" v={options.dataOnly} on={(b) => set('dataOnly', b)} />
              <Check label="Schema only" v={options.schemaOnly} on={(b) => set('schemaOnly', b)} />
            </>
          )}
          <label className={styles.field}>
            <span>Extra command args</span>
            <input
              type="text"
              value={options.extraArgs}
              placeholder="e.g. --exclude-table=logs"
              onChange={(e) => set('extraArgs', e.target.value)}
            />
          </label>
        </div>
      )}

      {step === 3 && (
        <div className={styles.options}>
          <div className={styles.field}>
            <span>Output path</span>
            <div className={styles.pathRow}>
              <input type="text" readOnly value={outputPath} placeholder="Choose a file…" />
              <Button variant="secondary" onClick={() => void chooseOutput()}>
                Browse
              </Button>
            </div>
          </div>
          <div className={styles.clientBox}>
            <span className={styles.clientLabel}>Native client</span>
            {detected?.found ? (
              <span className={styles.clientOk}>
                {detected.path}
                {detected.version ? ` · v${detected.version}` : ''}
              </span>
            ) : (
              <span className={styles.clientMissing}>Not found</span>
            )}
            <Button variant="ghost" onClick={openClientPath}>
              Configure…
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <ProgressLog
          lines={lines}
          isRunning={isRunning}
          exitCode={exitCode}
          summary={summary}
          completion={completion}
        />
      )}
    </Modal>
  )
}

function Check({ label, v, on }: { label: string; v: boolean; on: (b: boolean) => void }) {
  return (
    <label className={styles.checkItem}>
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
