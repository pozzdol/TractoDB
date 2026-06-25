import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { DARK_THEME, LIGHT_THEME, setCompletionSource, setupMonaco } from './monacoSetup'
import styles from './QueryEditor.module.css'

// Configure the bundled monaco + themes before the editor mounts (offline; the
// CDN loader is blocked by CSP).
setupMonaco()

interface QueryEditorProps {
  value: string
  language: string
  isDark: boolean
  tables: string[]
  columns: string[]
  onChange: (value: string) => void
  onRun: () => void
  onRunSelection: (selection: string) => void
}

// AGENTS.md-mandated editor options.
const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  tabSize: 2,
  renderLineHighlight: 'line',
  smoothScrolling: true,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
}

export function QueryEditor({
  value,
  language,
  isDark,
  tables,
  columns,
  onChange,
  onRun,
  onRunSelection,
}: QueryEditorProps) {
  // Keep the latest callbacks in refs — addCommand captures them once on mount.
  const onRunRef = useRef(onRun)
  const onRunSelectionRef = useRef(onRunSelection)
  onRunRef.current = onRun
  onRunSelectionRef.current = onRunSelection

  // Refresh the shared autocomplete source while this editor is focused.
  useEffect(() => {
    setCompletionSource({ tables, columns })
  }, [tables, columns])

  const handleMount: OnMount = (editorInstance, monacoInstance) => {
    editorInstance.onDidFocusEditorText(() => setCompletionSource({ tables, columns }))

    editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      onRunRef.current()
    })
    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Enter,
      () => {
        const selection = editorInstance.getSelection()
        const selected = selection ? (editorInstance.getModel()?.getValueInRange(selection) ?? '') : ''
        onRunSelectionRef.current(selected)
      },
    )
  }

  return (
    <div className={styles.wrap}>
      <Editor
        height="100%"
        width="100%"
        language={language}
        theme={isDark ? DARK_THEME : LIGHT_THEME}
        value={value}
        options={OPTIONS}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
      />
    </div>
  )
}
