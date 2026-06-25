import type { ResizableHandleProps } from '@/hooks/useResizable'
import styles from './ResizeHandle.module.css'

interface ResizeHandleProps {
  handleProps: ResizableHandleProps
  axis: 'x' | 'y'
  dragging?: boolean
}

/** A thin draggable divider between two panels. Width/cursor follow the axis. */
export function ResizeHandle({ handleProps, axis, dragging = false }: ResizeHandleProps) {
  const className = [
    styles.handle,
    axis === 'x' ? styles.vertical : styles.horizontal,
    dragging ? styles.dragging : '',
  ]
    .filter(Boolean)
    .join(' ')
  return <div {...handleProps} className={className} />
}
