import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { DARK_THEME, LIGHT_THEME, setupMonaco } from './monacoSetup'

setupMonaco()

const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  renderLineHighlight: 'none',
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
}

/** Read-only Monaco viewer for SQL (DDL display). Lazy-loaded by callers. */
export function SqlReadOnly({ value, isDark }: { value: string; isDark: boolean }) {
  return (
    <Editor
      height="100%"
      width="100%"
      language="sql"
      theme={isDark ? DARK_THEME : LIGHT_THEME}
      value={value}
      options={OPTIONS}
    />
  )
}
