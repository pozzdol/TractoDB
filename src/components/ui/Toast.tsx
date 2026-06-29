import { useEffect } from 'react'
import type { ToastAction } from '@/store/uiStore'
import styles from './Toast.module.css'

interface ToastProps {
  message: string
  onDone: () => void
  action?: ToastAction
  duration?: number
}

/** Transient bottom-centered notification; auto-dismisses. With an action
 *  (e.g. Undo) it stays a little longer so the user can react. */
export function Toast({ message, onDone, action, duration }: ToastProps) {
  const ms = duration ?? (action ? 3000 : 2600)
  useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [onDone, ms])
  return (
    <div className={styles.toast} role="status">
      <span>{message}</span>
      {action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            action.onClick()
            onDone()
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
