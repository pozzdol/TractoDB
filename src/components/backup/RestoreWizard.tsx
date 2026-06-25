import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import { useBackup } from '@/hooks/useBackup'
import type { RestoreConfig } from '@shared/ipc'
import { ProgressLog } from './ProgressLog'
import styles from './Wizard.module.css'

interface Options {
  clean: boolean
  ifExists: boolean
  noOwner: boolean
  extraArgs: string
}

export function RestoreWizard() {
  const target = useUiStore((s) => s.backupModal?.target)
  const close = useUiStore((s) => s.closeBackupModal)
  const { lines, isRunning, exitCode, startRestore, cancel } = useBackup()

  const [step, setStep] = useState(1)
  const [inputPath, setInputPath] = useState('')
  const [options, setOptions] = useState<Options>({
    clean: false,
    ifExists: false,
    noOwner: false,
    extraArgs: '',
  })

  if (!target) return null
  const isPg = target.databaseType === 'postgresql'

  async function chooseInput(): Promise<void> {
    const r = await api().dialog.open({
      title: 'Select a dump file to restore',
      filters: [
        { name: 'Dump files', extensions: ['sql', 'dump', 'tar', 'gz'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (r.success && r.data) setInputPath(r.data)
  }

  function start(): void {
    const config: RestoreConfig = {
      connectionId: target!.connectionId,
      databaseType: target!.databaseType,
      database: target!.database,
      inputPath,
      clean: options.clean,
      ifExists: options.ifExists,
      noOwner: options.noOwner,
      extraArgs: options.extraArgs,
    }
    setStep(3)
    void startRestore(config)
  }

  const set = <K extends keyof Options>(key: K, value: Options[K]): void =>
    setOptions((o) => ({ ...o, [key]: value }))

  return (
    <Modal
      title={`Restore — ${target.database}`}
      size="lg"
      onClose={close}
      footer={
        step < 3 ? (
          <>
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
            )}
            {step === 1 && (
              <Button variant="primary" disabled={!inputPath} onClick={() => setStep(2)}>
                Next
              </Button>
            )}
            {step === 2 && (
              <Button variant="primary" onClick={start}>
                Start restore
              </Button>
            )}
          </>
        ) : isRunning ? (
          <Button variant="danger" onClick={() => void cancel()}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        )
      }
    >
      <p className={styles.stepHead}>Step {step} of 3</p>

      {step === 1 && (
        <div className={styles.options}>
          <div className={styles.field}>
            <span>Restore into</span>
            <input type="text" readOnly value={target.database} />
          </div>
          <div className={styles.field}>
            <span>Input file</span>
            <div className={styles.pathRow}>
              <input type="text" readOnly value={inputPath} placeholder="Choose a dump file…" />
              <Button variant="secondary" onClick={() => void chooseInput()}>
                Browse
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.options}>
          {isPg && (
            <>
              <Check label="Clean (drop objects before recreate)" v={options.clean} on={(b) => set('clean', b)} />
              <Check label="Include IF EXISTS" v={options.ifExists} on={(b) => set('ifExists', b)} />
              <Check label="No owner" v={options.noOwner} on={(b) => set('noOwner', b)} />
            </>
          )}
          {!isPg && (
            <p className={styles.hint}>
              MySQL restore replays the dump via the <code>mysql</code> client.
            </p>
          )}
          <label className={styles.field}>
            <span>Extra command args</span>
            <input
              type="text"
              value={options.extraArgs}
              onChange={(e) => set('extraArgs', e.target.value)}
            />
          </label>
        </div>
      )}

      {step === 3 && <ProgressLog lines={lines} isRunning={isRunning} exitCode={exitCode} />}
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
