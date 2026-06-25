import { create } from 'zustand'
import { DEFAULT_LAYOUT, DEFAULT_PREFERENCES } from '@shared/ipc'
import type {
  BackupDatabaseType,
  LayoutConfig,
  SecretsBackend,
  Theme,
  UserPreferences,
} from '@shared/ipc'
import { api } from './ipcClient'

export interface BackupTarget {
  connectionId: string
  databaseType: BackupDatabaseType
  database: string
}

export interface BackupModalState {
  mode: 'backup' | 'restore'
  target: BackupTarget
}

type ResolvedTheme = 'light' | 'dark'

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

/** Persist helpers — fire-and-forget; a missing bridge must not crash the UI. */
function persistLayout(layout: LayoutConfig): void {
  try {
    void api().config.saveLayout(layout)
  } catch {
    /* bridge unavailable */
  }
}

function persistPreferences(preferences: UserPreferences): void {
  try {
    void api().config.savePreferences(preferences)
  } catch {
    /* bridge unavailable */
  }
}

export interface ConnectionFormState {
  open: boolean
  /** Connection id being edited, or null for a new connection. */
  editId: string | null
}

export interface UiStore {
  theme: Theme
  resolvedTheme: ResolvedTheme
  layout: LayoutConfig
  preferences: UserPreferences
  hydrated: boolean
  connectionForm: ConnectionFormState
  /** Where passwords are stored; null until hydrated. */
  secretsBackend: SecretsBackend | null
  backupModal: BackupModalState | null
  clientPathOpen: boolean

  openConnectionForm: (editId?: string | null) => void
  closeConnectionForm: () => void
  dismissSecretsWarning: () => void
  openBackup: (target: BackupTarget) => void
  openRestore: (target: BackupTarget) => void
  closeBackupModal: () => void
  openClientPath: () => void
  closeClientPath: () => void

  hydrate: () => Promise<void>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setSidebarWidth: (px: number) => void
  setRightPanelWidth: (px: number) => void
  setResultsHeight: (px: number) => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  theme: DEFAULT_PREFERENCES.theme,
  resolvedTheme: resolveTheme(DEFAULT_PREFERENCES.theme),
  layout: DEFAULT_LAYOUT,
  preferences: DEFAULT_PREFERENCES,
  hydrated: false,
  connectionForm: { open: false, editId: null },
  secretsBackend: null,
  backupModal: null,
  clientPathOpen: false,

  openConnectionForm(editId = null) {
    set({ connectionForm: { open: true, editId } })
  },

  closeConnectionForm() {
    set({ connectionForm: { open: false, editId: null } })
  },

  openBackup(target) {
    set({ backupModal: { mode: 'backup', target } })
  },

  openRestore(target) {
    set({ backupModal: { mode: 'restore', target } })
  },

  closeBackupModal() {
    set({ backupModal: null })
  },

  openClientPath() {
    set({ clientPathOpen: true })
  },

  closeClientPath() {
    set({ clientPathOpen: false })
  },

  dismissSecretsWarning() {
    const preferences = { ...get().preferences, secretsWarningDismissed: true }
    set({ preferences })
    persistPreferences(preferences)
  },

  async hydrate() {
    let preferences = DEFAULT_PREFERENCES
    let layout = DEFAULT_LAYOUT
    try {
      preferences = await api()
        .config.loadPreferences()
        .then((r) => (r.success ? r.data : DEFAULT_PREFERENCES))
      layout = await api()
        .config.loadLayout()
        .then((r) => (r.success ? r.data : DEFAULT_LAYOUT))
    } catch {
      // Bridge unavailable (e.g. renderer opened outside Electron) — use defaults.
    }
    const resolvedTheme = resolveTheme(preferences.theme)
    applyTheme(resolvedTheme)

    let secretsBackend: SecretsBackend | null = null
    try {
      secretsBackend = await api()
        .config.secretsBackend()
        .then((r) => (r.success ? r.data : null))
    } catch {
      // Bridge unavailable.
    }

    set({
      preferences,
      layout,
      theme: preferences.theme,
      resolvedTheme,
      hydrated: true,
      secretsBackend,
    })

    // Track OS theme changes while the user is on "system".
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (get().theme !== 'system') return
        const next = resolveTheme('system')
        applyTheme(next)
        set({ resolvedTheme: next })
      })
  },

  setTheme(theme) {
    const resolvedTheme = resolveTheme(theme)
    applyTheme(resolvedTheme)
    const preferences = { ...get().preferences, theme }
    set({ theme, resolvedTheme, preferences })
    persistPreferences(preferences)
  },

  toggleTheme() {
    get().setTheme(get().resolvedTheme === 'dark' ? 'light' : 'dark')
  },

  setSidebarWidth(px) {
    const layout = { ...get().layout, sidebarWidth: px }
    set({ layout })
    persistLayout(layout)
  },

  setRightPanelWidth(px) {
    const layout = { ...get().layout, rightPanelWidth: px }
    set({ layout })
    persistLayout(layout)
  },

  setResultsHeight(px) {
    const layout = { ...get().layout, resultsPanelHeight: px }
    set({ layout })
    persistLayout(layout)
  },

  toggleSidebar() {
    const layout = { ...get().layout, sidebarCollapsed: !get().layout.sidebarCollapsed }
    set({ layout })
    persistLayout(layout)
  },

  toggleRightPanel() {
    const layout = { ...get().layout, rightPanelCollapsed: !get().layout.rightPanelCollapsed }
    set({ layout })
    persistLayout(layout)
  },
}))
