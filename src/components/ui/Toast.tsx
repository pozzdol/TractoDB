import { useEffect } from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  message: string
  onDone: () => void
  duration?: number
}

/** Transient bottom-centered notification; auto-dismisses. */
export function Toast({ message, onDone, duration = 2600 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])
  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  )
}
