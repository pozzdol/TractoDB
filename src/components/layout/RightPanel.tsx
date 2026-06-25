import type { ReactNode } from 'react'
import styles from './RightPanel.module.css'

/** Right info panel chrome. Hosts connection/table details (Phase 10). */
export function RightPanel({ width, children }: { width: number; children: ReactNode }) {
  return (
    <aside className={styles.panel} style={{ width }}>
      {children}
    </aside>
  )
}
