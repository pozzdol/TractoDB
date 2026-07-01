import { Suspense, lazy, useEffect, useState } from 'react'
import { IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/store/ipcClient'
import { useUiStore } from '@/store/uiStore'
import type { TableTabProps } from '../TableViewer'
import styles from './Properties.module.css'

const SqlReadOnly = lazy(() =>
  import('@/components/editor/SqlReadOnly').then((m) => ({ default: m.SqlReadOnly })),
)

export function PropertiesDDL({ connectionId, database, schema, table }: TableTabProps) {
  const isDark = useUiStore((s) => s.resolvedTheme === 'dark')
  const [ddl, setDdl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api()
      .schema.getFullDDL({ connectionId, database, schema, table })
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
    <div className={styles.content}>
      <div className={styles.copyBar}>
        <span className={styles.ddlSummary}>{ddlSummary(ddl)}</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(ddl)}>
          <IconCopy size={14} />
          Copy
        </Button>
      </div>
      <div className={styles.editor}>
        <Suspense fallback={<div className={styles.empty}>Loading…</div>}>
          <SqlReadOnly value={ddl} isDark={isDark} />
        </Suspense>
      </div>
    </div>
  )
}

/** Count assembled sections for the "Complete DDL — …" indicator (BUG 9). */
function ddlSummary(ddl: string): string {
  if (!ddl) return ''
  const count = (re: RegExp): number => (ddl.match(re) ?? []).length
  const parts: string[] = ['CREATE TABLE']
  const n = (num: number, one: string, many: string): void => {
    if (num > 0) parts.push(`${num} ${num === 1 ? one : many}`)
  }
  n(count(/\bCREATE (?:UNIQUE )?INDEX\b/gi), 'index', 'indexes')
  n(count(/\bADD CONSTRAINT\b/gi), 'constraint', 'constraints')
  n(count(/\bCREATE TRIGGER\b/gi), 'trigger', 'triggers')
  n(count(/\bCREATE (?:OR REPLACE )?FUNCTION\b/gi), 'function', 'functions')
  return `Complete DDL — includes ${parts.join(' + ')}`
}
