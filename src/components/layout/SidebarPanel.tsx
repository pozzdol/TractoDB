import type { ReactNode } from 'react'
import styles from './SidebarPanel.module.css'

/** Left sidebar chrome. Hosts the connection tree (Phase 5). */
export function SidebarPanel({ width, children }: { width: number; children: ReactNode }) {
  return (
    <aside className={styles.panel} style={{ width }}>
      {children}
    </aside>
  )
}
