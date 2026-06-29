import { useEffect, useRef, useState } from 'react'
import { IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import type { BackupProgress } from '@shared/ipc'
import styles from './ProgressLog.module.css'

interface ProgressLogProps {
  lines: BackupProgress[]
  isRunning: boolean
  exitCode: number | null
  /** Summary line shown before the CLI output (e.g. "Starting backup of N tables…"). */
  summary?: string
  /** Completion line shown after a successful run (with table count + file size). */
  completion?: string
  /** Operation + database — used to label the "Copy Error" payload on failure. */
  operation?: 'Backup' | 'Restore'
  database?: string
}

export function ProgressLog({
  lines,
  isRunning,
  exitCode,
  summary,
  completion,
  operation = 'Backup',
  database,
}: ProgressLogProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, completion])

  const failed = !isRunning && exitCode !== null && exitCode !== 0

  function copyError(): void {
    const errorLines = lines.filter((l) => l.isError)
    const body = (errorLines.length > 0 ? errorLines : lines).map((l) => l.line).join('\n')
    const text =
      `TractoDB ${operation} Error\n` +
      `Date: ${new Date().toISOString()}\n` +
      `Operation: ${operation}\n` +
      `Database: ${database ?? ''}\n` +
      `Exit code: ${exitCode}\n\n` +
      `--- Error output ---\n${body}`
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.log} role="log" aria-live="polite">
        {summary ? <div className={styles.summary}>{summary}</div> : null}
        {lines.length === 0 && !summary ? (
          <span className={styles.idle}>Waiting to start…</span>
        ) : (
          lines.map((entry, i) => (
            <div key={i} className={entry.isError ? styles.err : styles.out}>
              {entry.line}
            </div>
          ))
        )}
        {exitCode === 0 && completion ? <div className={styles.completion}>{completion}</div> : null}
        <div ref={endRef} />
      </div>
      <div className={styles.status}>
        {isRunning ? (
          <span className={styles.running}>Running…</span>
        ) : exitCode === null ? (
          <span className={styles.muted}>Ready</span>
        ) : exitCode === 0 ? (
          <span className={styles.ok}>Completed successfully</span>
        ) : (
          <span className={styles.failed}>Exited with code {exitCode}</span>
        )}
        {failed ? (
          <>
            <span className={styles.spacer} />
            <Button variant="secondary" onClick={copyError}>
              <IconCopy size={14} />
              {copied ? 'Copied!' : 'Copy Error'}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
