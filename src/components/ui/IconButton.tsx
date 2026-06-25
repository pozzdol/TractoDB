import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required for accessibility — also used as the tooltip. */
  label: string
  /** The icon element (e.g. <IconPlus size={16} />). */
  children: ReactNode
  /** Renders the pressed/toggled-on state. */
  active?: boolean
  /** Optional trailing text label (for buttons like "New Connection"). */
  text?: string
}

/** Square, icon-first button used across the app chrome. Carries full states. */
export function IconButton({
  label,
  children,
  active = false,
  text,
  className,
  ...rest
}: IconButtonProps) {
  const classes = [styles.button, active ? styles.active : '', text ? styles.withText : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={classes}
      {...rest}
    >
      <span className={styles.icon}>{children}</span>
      {text ? <span className={styles.text}>{text}</span> : null}
    </button>
  )
}
