import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type Axis = 'x' | 'y'

interface UseResizableOptions {
  axis: Axis
  /** Current size from the store (px). Used as the source of truth when idle. */
  value: number
  min: number
  max: number | (() => number)
  /** Reverse drag direction (right panel / bottom results grow as you drag in). */
  invert?: boolean
  /** Keyboard arrow step in px. */
  step?: number
  /** Called once on release (and on keyboard change) — the store persists it. */
  onCommit?: (size: number) => void
}

export interface ResizableHandleProps {
  role: 'separator'
  tabIndex: 0
  'aria-orientation': 'vertical' | 'horizontal'
  'aria-valuenow': number
  'aria-valuemin': number
  'aria-valuemax': number
  onPointerDown: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
}

interface UseResizableResult {
  size: number
  dragging: boolean
  handleProps: ResizableHandleProps
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Drag-to-resize for a panel. The hook owns the live size during a drag (so we
 * don't thrash the store every frame); on release it calls `onCommit`, which the
 * store persists to layout.json. Keyboard arrows resize in `step` increments.
 */
export function useResizable(options: UseResizableOptions): UseResizableResult {
  const { axis, value, min, invert = false, step = 16, onCommit } = options
  const [size, setSize] = useState(value)
  const [dragging, setDragging] = useState(false)

  const sizeRef = useRef(size)
  sizeRef.current = size
  const draggingRef = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const resolveMax = useCallback(
    () => (typeof options.max === 'function' ? options.max() : options.max),
    [options],
  )

  // Stay in sync with the store while idle (e.g. after hydrate/restore).
  useEffect(() => {
    if (!draggingRef.current) setSize(value)
  }, [value])

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      if (!draggingRef.current) return
      const current = axis === 'x' ? e.clientX : e.clientY
      const rawDelta = current - startPos.current
      const delta = invert ? -rawDelta : rawDelta
      setSize(clamp(startSize.current + delta, min, resolveMax()))
    }
    function onUp(): void {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      onCommit?.(sizeRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [axis, invert, min, resolveMax, onCommit])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent): void => {
      e.preventDefault()
      draggingRef.current = true
      setDragging(true)
      startPos.current = axis === 'x' ? e.clientX : e.clientY
      startSize.current = sizeRef.current
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [axis],
  )

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent): void => {
      const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
      const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
      if (e.key !== grow && e.key !== shrink) return
      e.preventDefault()
      const direction = e.key === grow ? 1 : -1
      const delta = (invert ? -direction : direction) * step
      const next = clamp(sizeRef.current + delta, min, resolveMax())
      setSize(next)
      onCommit?.(next)
    },
    [axis, invert, step, min, resolveMax, onCommit],
  )

  return {
    size,
    dragging,
    handleProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal',
      'aria-valuenow': Math.round(size),
      'aria-valuemin': min,
      'aria-valuemax': Math.round(resolveMax()),
      onPointerDown,
      onKeyDown,
    },
  }
}
