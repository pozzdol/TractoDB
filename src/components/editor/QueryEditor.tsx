import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type * as monaco from 'monaco-editor'
import { DARK_THEME, LIGHT_THEME, setupMonaco } from './monacoSetup'
import { registerAliasProvider } from './autocomplete/aliasProvider'
import { registerColumnProvider } from './autocomplete/columnProvider'
import { registerTableProvider } from './autocomplete/tableProvider'
import type { EditorSchema } from './autocomplete/schemaCache'
import styles from './QueryEditor.module.css'

// Configure the bundled monaco + themes before the editor mounts (offline; the
// CDN loader is blocked by CSP).
setupMonaco()

interface QueryEditorProps {
  value: string
  language: string
  isDark: boolean
  /** Active connection's schema; null until a connection is active. */
  schema: EditorSchema | null
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
  inlineSuggest: { enabled: true },
}

type Mounted = {
  editor: monaco.editor.IStandaloneCodeEditor
  monaco: typeof monaco
}

export function QueryEditor({
  value,
  language,
  isDark,
  schema,
  onChange,
  onRun,
  onRunSelection,
}: QueryEditorProps) {
  // Keep the latest callbacks in refs — addCommand captures them once on mount.
  const onRunRef = useRef(onRun)
  const onRunSelectionRef = useRef(onRunSelection)
  onRunRef.current = onRun
  onRunSelectionRef.current = onRunSelection

  const [mounted, setMounted] = useState<Mounted | null>(null)

  // Register the schema-aware providers; re-register when the connection (schema)
  // changes so columns are never mixed across connections.
  useEffect(() => {
    if (!mounted || !schema) return
    const disposables = [
      registerAliasProvider(mounted.editor, mounted.monaco, schema),
      registerColumnProvider(mounted.editor, mounted.monaco, schema),
      registerTableProvider(mounted.editor, mounted.monaco, schema),
    ]
    return () => disposables.forEach((d) => d.dispose())
  }, [mounted, schema])

  const handleMount: OnMount = (editorInstance, monacoInstance) => {
    setMounted({ editor: editorInstance, monaco: monacoInstance })

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
