import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck } from '@tabler/icons-react'
import type { TypeGroup } from '@/lib/columnTypeCatalog'
import styles from './TypeSelect.module.css'

interface TypeSelectProps {
  value: string
  groups: TypeGroup[]
  disabled?: boolean
  onSelect: (type: string) => void
}

/** A searchable, grouped data-type dropdown (BUG 12 Part A). */
export function TypeSelect({ value, groups, disabled, onSelect }: TypeSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [rect, setRect] = useState<{ x: number; y: number; w: number } | null>(null)

  function openMenu(): void {
    if (disabled) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setRect({ x: r.left, y: r.bottom, w: r.width })
    setSearch('')
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent): void {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({ label: g.label, types: g.types.filter((t) => t.toLowerCase().includes(q)) }))
      .filter((g) => g.types.length > 0)
  }, [groups, search])

  function choose(t: string): void {
    onSelect(t)
    setOpen(false)
  }

  const width = Math.max(rect?.w ?? 180, 180)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        disabled={disabled}
        onClick={openMenu}
      >
        {value || <span className={styles.placeholder}>type…</span>}
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={popRef}
              className={styles.pop}
              style={{ left: Math.min(rect.x, window.innerWidth - width - 8), top: rect.y, width }}
              role="listbox"
            >
              <input
                className={styles.search}
                placeholder="Search types…"
                value={search}
                autoFocus
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={styles.list}>
                {filtered.length === 0 ? (
                  <div className={styles.empty}>No matching types</div>
                ) : (
                  filtered.map((g) => (
                    <div key={g.label}>
                      <div className={styles.groupHead}>{g.label.toUpperCase()}</div>
                      {g.types.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="option"
                          aria-selected={t === value}
                          className={`${styles.option} ${t === value ? styles.selected : ''}`}
                          onClick={() => choose(t)}
                        >
                          <span>{t}</span>
                          {t === value ? <IconCheck size={13} /> : null}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
