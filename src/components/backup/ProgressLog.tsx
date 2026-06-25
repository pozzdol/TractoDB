import { useEffect, useRef } from 'react'
import type { BackupProgress } from '@shared/ipc'
import styles from './ProgressLog.module.css'

interface ProgressLogProps {
  lines: BackupProgress[]
  isRunning: boolean
  exitCode: number | null
}

export function ProgressLog({ lines, isRunning, exitCode }: ProgressLogProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  return (
    <div className={styles.wrap}>
      <div className={styles.log} role="log" aria-live="polite">
        {lines.length === 0 ? (
          <span className={styles.idle}>Waiting to start…</span>
        ) : (
          lines.map((entry, i) => (
            <div key={i} className={entry.isError ? styles.err : styles.out}>
              {entry.line}
            </div>
          ))
        )}
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
