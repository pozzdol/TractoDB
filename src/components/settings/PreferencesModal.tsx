import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { useUiStore } from '@/store/uiStore'
import { applyPreferences } from '@/lib/applyPreferences'
import { DEFAULT_PREFERENCES } from '@shared/ipc'
import type { DensityMode, GridStripeColor, Theme, UserPreferences } from '@shared/ipc'
import styles from './PreferencesModal.module.css'

type Category = 'appearance' | 'editor' | 'grid'

const UI_FONTS: { value: string; label: string }[] = [
  { value: 'system-ui', label: 'system-ui (System default)' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: '-apple-system, sans-serif', label: '-apple-system' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe UI' },
  { value: 'Ubuntu, sans-serif', label: 'Ubuntu' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
]

const EDITOR_FONTS: { value: string; label: string }[] = [
  { value: "'JetBrains Mono', 'Fira Code', monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: 'Consolas, monospace', label: 'Consolas' },
  { value: 'Monaco, monospace', label: 'Monaco' },
  { value: 'monospace', label: 'monospace (System default)' },
]

const DENSITIES: DensityMode[] = ['compact', 'normal', 'spacious']
const STRIPE_COLORS: GridStripeColor[] = ['default', 'blue', 'green', 'purple', 'warm']

// Fields the modal owns — Reset restores only these (keeps nativeClient etc.).
const RESET_KEYS = [
  'theme', 'uiFontFamily', 'uiFontSize', 'editorFontFamily', 'editorFontSize',
  'densityMode', 'gridStripeEnabled', 'gridStripeColor', 'gridStripeIntensity',
] as const

export function PreferencesModal() {
  const stored = useUiStore((s) => s.preferences)
  const save = useUiStore((s) => s.savePreferences)
  const close = useUiStore((s) => s.closePreferences)

  const [category, setCategory] = useState<Category>('appearance')
  const [draft, setDraft] = useState<UserPreferences>(stored)

  // Live preview: apply the draft straight to the DOM (not persisted yet).
  useEffect(() => {
    applyPreferences(draft)
  }, [draft])

  const set = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }))

  function onApply(): void {
    save(draft)
    close()
  }
  function onCancel(): void {
    applyPreferences(stored) // revert the live-preview DOM changes
    close()
  }
  function onReset(): void {
    setDraft((d) => {
      const next = { ...d }
      for (const k of RESET_KEYS) (next[k] as UserPreferences[typeof k]) = DEFAULT_PREFERENCES[k]
      return next
    })
  }

  return (
    <Modal
      title="Preferences"
      size="lg"
      onClose={onCancel}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onReset}>
            Reset to Defaults
          </Button>
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onApply}>
            Apply
          </Button>
        </div>
      }
    >
      <div className={styles.layout}>
        <nav className={styles.nav}>
          {(['appearance', 'editor', 'grid'] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.navItem} ${category === c ? styles.navActive : ''}`}
              onClick={() => setCategory(c)}
            >
              {c === 'appearance' ? 'Appearance' : c === 'editor' ? 'Editor' : 'Data Grid'}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {category === 'appearance' && (
            <>
              <Field label="Theme">
                <div className={styles.radioRow}>
                  {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                    <label key={t} className={styles.radio}>
                      <input
                        type="radio"
                        name="theme"
                        checked={draft.theme === t}
                        onChange={() => set('theme', t)}
                      />
                      <span>{t[0]?.toUpperCase() + t.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Interface font">
                <select
                  className={styles.select}
                  value={draft.uiFontFamily}
                  onChange={(e) => set('uiFontFamily', e.target.value)}
                >
                  {UI_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <Slider
                  aria-label="Interface font size"
                  value={draft.uiFontSize}
                  min={11}
                  max={16}
                  onChange={(v) => set('uiFontSize', v)}
                  format={(v) => `${v}px`}
                />
              </Field>

              <Field label="Density">
                <div className={styles.segmented}>
                  {DENSITIES.map((d) => (
                    <Button
                      key={d}
                      variant={draft.densityMode === d ? 'primary' : 'secondary'}
                      onClick={() => set('densityMode', d)}
                    >
                      {d[0]?.toUpperCase() + d.slice(1)}
                    </Button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {category === 'editor' && (
            <>
              <Field label="Editor font">
                <select
                  className={styles.select}
                  value={draft.editorFontFamily}
                  onChange={(e) => set('editorFontFamily', e.target.value)}
                >
                  {EDITOR_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <Slider
                  aria-label="Editor font size"
                  value={draft.editorFontSize}
                  min={11}
                  max={18}
                  onChange={(v) => set('editorFontSize', v)}
                  format={(v) => `${v}px`}
                />
              </Field>

              <Field label="Preview">
                <pre
                  className={styles.codePreview}
                  style={{ fontFamily: draft.editorFontFamily, fontSize: draft.editorFontSize }}
                >
                  {`SELECT u.name, u.email\nFROM users u\nWHERE u.active = true`}
                </pre>
              </Field>
            </>
          )}

          {category === 'grid' && (
            <>
              <Field label="Alternating row colors">
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={draft.gridStripeEnabled}
                    onChange={(e) => set('gridStripeEnabled', e.target.checked)}
                  />
                  <span>Enable zebra striping</span>
                </label>
              </Field>

              <Field label="Color">
                <div className={styles.colorRow}>
                  {STRIPE_COLORS.map((c) => (
                    <Button
                      key={c}
                      variant={draft.gridStripeColor === c ? 'primary' : 'secondary'}
                      onClick={() => set('gridStripeColor', c)}
                    >
                      {c[0]?.toUpperCase() + c.slice(1)}
                    </Button>
                  ))}
                </div>
              </Field>

              <Field label="Intensity">
                <Slider
                  aria-label="Stripe intensity"
                  value={draft.gridStripeIntensity}
                  min={1}
                  max={5}
                  onChange={(v) => set('gridStripeIntensity', v)}
                />
              </Field>

              <Field label="Preview">
                <table className={styles.gridPreview}>
                  <thead>
                    <tr>
                      <th>id</th>
                      <th>name</th>
                      <th>email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['1', 'Alice', 'a@…'],
                      ['2', 'Bob', 'b@…'],
                      ['3', 'Carol', 'c@…'],
                    ].map((r, i) => (
                      <tr
                        key={r[0]}
                        style={{
                          background: i % 2 === 1 ? 'var(--grid-row-even)' : 'var(--grid-row-odd)',
                        }}
                      >
                        <td>{r[0]}</td>
                        <td>{r[1]}</td>
                        <td>{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  )
}
