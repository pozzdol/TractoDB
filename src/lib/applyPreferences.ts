import type { Theme, UserPreferences } from '@shared/ipc'

export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

// Hue mixed into the even row for each stripe palette. `default` uses the
// theme's own text color so the tint stays neutral in both light and dark.
const STRIPE_HUE: Record<UserPreferences['gridStripeColor'], string> = {
  default: 'var(--color-text-primary)',
  blue: '#3b82f6',
  green: '#22a06b',
  purple: '#8b5cf6',
  warm: '#e8943a',
}

/**
 * Apply all DOM-affecting preferences: theme, UI/editor fonts, density, and the
 * grid zebra stripe. Used on hydrate, on save, and live by the Preferences modal.
 */
export function applyPreferences(p: UserPreferences): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(p.theme)

  root.style.setProperty('--font-sans', p.uiFontFamily)
  root.style.setProperty('--text-base', `${p.uiFontSize}px`)
  root.style.setProperty('--font-mono', p.editorFontFamily)
  root.dataset.density = p.densityMode

  // Zebra: tint the even row over the theme's own odd base so it adapts to
  // light/dark automatically (we never hardcode the odd colour here).
  const strength = p.gridStripeEnabled ? p.gridStripeIntensity * 2 : 0 // 1–5 → 2–10%
  const hue = STRIPE_HUE[p.gridStripeColor] ?? STRIPE_HUE.default
  root.style.setProperty('--grid-stripe-intensity', String(strength / 100))
  root.style.setProperty(
    '--grid-row-even',
    `color-mix(in srgb, ${hue} ${strength}%, var(--grid-row-odd))`,
  )
}
