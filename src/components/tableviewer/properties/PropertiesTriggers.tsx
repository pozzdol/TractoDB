import { Suspense, lazy, useEffect, useState } from 'react'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import type { TriggerInfo } from '@shared/ipc'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

const SqlReadOnly = lazy(() =>
  import('@/components/editor/SqlReadOnly').then((m) => ({ default: m.SqlReadOnly })),
)

export function PropertiesTriggers({ connectionId, database, schema, table }: TableTabProps) {
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const [triggers, setTriggers] = useState<TriggerInfo[] | null>(null)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    let cancelled = false
    setTriggers(null)
    setSelected(0)
    void api()
      .schema.getTriggers({ connectionId, database, schema, table })
      .then((r) => {
        if (!cancelled && r.success) setTriggers(r.data)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table])

  if (triggers && triggers.length === 0) {
    return <div className={styles.empty}>No triggers defined</div>
  }

  const active = triggers?.[selected]

  return (
    <div className={styles.split}>
      <div className={styles.splitList}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Event</th>
              <th>Timing</th>
            </tr>
          </thead>
          <tbody>
            {(triggers ?? []).map((t, i) => (
              <tr
                key={t.name}
                className={`${styles.row} ${i === selected ? styles.rowActive : ''}`}
                onClick={() => setSelected(i)}
              >
                <td className={styles.mono}>{t.name}</td>
                <td>{t.event}</td>
                <td>{t.timing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.editor}>
        {active ? (
          <Suspense fallback={<div className={styles.empty}>Loading…</div>}>
            <SqlReadOnly value={active.body} isDark={isDark} />
          </Suspense>
        ) : null}
      </div>
    </div>
  )
}
