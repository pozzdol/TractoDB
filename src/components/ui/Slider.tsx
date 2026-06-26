import styles from './Slider.module.css'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Render the current value (e.g. `v => `${v}px``). */
  format?: (value: number) => string
  'aria-label'?: string
}

/** Thin range slider matching DESIGN.md — accent fill, 14px thumb, value readout. */
export function Slider({ value, min, max, step = 1, onChange, format, ...rest }: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const track = `linear-gradient(to right, var(--color-accent) 0% ${pct}%, var(--color-border-strong) ${pct}% 100%)`
  return (
    <div className={styles.wrap}>
      <input
        type="range"
        className={styles.input}
        style={{ background: track }}
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={rest['aria-label']}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.value}>{format ? format(value) : value}</span>
    </div>
  )
}
