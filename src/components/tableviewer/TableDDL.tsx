import { Suspense, lazy, useEffect, useState } from 'react'
import { IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import type { TableTabProps } from './TableViewer'
import styles from './TableDDL.module.css'

const SqlReadOnly = lazy(() =>
  import('@/components/editor/SqlReadOnly').then((m) => ({ default: m.SqlReadOnly })),
)

export function TableDDL({ connectionId, database, schema, table }: TableTabProps) {
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const [ddl, setDdl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api()
      .schema.getTableDDL({ connectionId, database, schema, table })
      .then((r) => {
        if (cancelled) return
        if (r.success) setDdl(r.data)
        else setError(r.error)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, database, schema, table])

  if (error) return <div className={styles.error}>{error}</div>

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(ddl)}>
          <IconCopy size={14} />
          Copy
        </Button>
      </div>
      <div className={styles.editor}>
        <Suspense fallback={<div className={styles.message}>Loading…</div>}>
          <SqlReadOnly value={ddl} isDark={isDark} />
        </Suspense>
      </div>
    </div>
  )
}
