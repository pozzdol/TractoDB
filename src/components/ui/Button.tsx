import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <IconLoader2 size={14} className={styles.spin} /> : null}
      {children}
    </button>
  )
}
