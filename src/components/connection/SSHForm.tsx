import { IconLock } from '@tabler/icons-react'
import styles from './SSHForm.module.css'

/**
 * SSH tunnel is out of scope for V1 (CONTEXT.md decision log). This is a
 * disabled placeholder so the capability is visible but clearly deferred to v2.
 */
export function SSHForm() {
  return (
    <section className={styles.wrap} aria-disabled="true">
      <div className={styles.head}>
        <IconLock size={14} />
        <span className={styles.title}>SSH Tunnel</span>
        <span className={styles.badge}>v2</span>
      </div>
      <p className={styles.note}>
        Connecting through an SSH bastion is planned for a future release. For now,
        connect directly over IP and port.
      </p>
    </section>
  )
}
