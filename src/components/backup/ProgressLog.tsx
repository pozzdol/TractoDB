import { useEffect, useRef } from 'react'
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
}

export function ProgressLog({ lines, isRunning, exitCode, summary, completion }: ProgressLogProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, completion])

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
      </div>
    </div>
  )
}
