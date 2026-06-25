import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  /** Render a divider; other fields ignored. */
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/** A cursor-anchored menu rendered in a portal. Closes on outside click, Escape,
 *  scroll, or resize; arrow keys move focus between actionable items. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Clamp into the viewport once measured.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const nextX = Math.min(x, window.innerWidth - width - 8)
    const nextY = Math.min(y, window.innerHeight - height - 8)
    setPos({ x: Math.max(8, nextX), y: Math.max(8, nextY) })
    el.focus()
  }, [x, y])

  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function moveFocus(dir: 1 | -1): void {
    const menu = ref.current
    if (!menu) return
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (buttons.length === 0) return
    const index = buttons.findIndex((b) => b === document.activeElement)
    const next = (index + dir + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          moveFocus(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          moveFocus(-1)
        }
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className={styles.separator} role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {item.icon ? <span className={styles.icon}>{item.icon}</span> : <span className={styles.icon} />}
            <span className={styles.label}>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
