import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { DatabaseIcon, DB_LABELS } from '@/components/ui/DatabaseIcon'
import { DATABASE_TYPES } from '@/types/connection'
import type { DatabaseType } from '@/types/connection'
import styles from './DatabaseTypeSelect.module.css'

interface DatabaseTypeSelectProps {
  value: DatabaseType
  onChange: (type: DatabaseType) => void
}

/** Custom dropdown showing each database type's brand icon + label. */
export function DatabaseTypeSelect({ value, onChange }: DatabaseTypeSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DatabaseIcon type={value} size={16} />
        <span className={styles.label}>{DB_LABELS[value]}</span>
        <IconChevronDown size={14} className={styles.chev} />
      </button>
      {open ? (
        <ul className={styles.list} role="listbox">
          {DATABASE_TYPES.map((t) => (
            <li key={t.type}>
              <button
                type="button"
                role="option"
                aria-selected={t.type === value}
                className={`${styles.option} ${t.type === value ? styles.selected : ''}`}
                onClick={() => {
                  onChange(t.type)
                  setOpen(false)
                }}
              >
                <DatabaseIcon type={t.type} size={16} />
                <span>{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
