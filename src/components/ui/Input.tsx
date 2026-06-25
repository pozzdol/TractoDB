import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Trailing control (e.g. a Browse button) rendered next to the input. */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, trailing, id, className, ...rest },
  ref,
) {
  return (
    <label className={styles.field}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.controlRow}>
        <input
          ref={ref}
          id={id}
          className={`${styles.input} ${error ? styles.invalid : ''} ${className ?? ''}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {trailing}
      </span>
      {error ? <span className={styles.error}>{error}</span> : null}
    </label>
  )
})
