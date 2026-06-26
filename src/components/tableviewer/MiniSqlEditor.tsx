import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type * as monaco from 'monaco-editor'
import { DARK_THEME, LIGHT_THEME, setupMonaco } from '@/components/editor/monacoSetup'
import { registerTableColumnProvider } from '@/components/editor/autocomplete/tableColumnProvider'

setupMonaco()

interface MiniSqlEditorProps {
  value: string
  isDark: boolean
  columns: string[]
  onChange: (value: string) => void
  onApply: () => void
}

// Single-line editor: no gutters/minimap/scrollbars, no wrapping.
const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineNumbers: 'off',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  folding: false,
  glyphMargin: false,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 0,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'none',
  contextmenu: false,
  scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false, useShadows: false },
  automaticLayout: true,
  padding: { top: 4, bottom: 4 },
}

export function MiniSqlEditor({ value, isDark, columns, onChange, onApply }: MiniSqlEditorProps) {
  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  const mounted = useRef<{ editor: monaco.editor.IStandaloneCodeEditor; monaco: typeof monaco } | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [ready, setReady] = useState(false)

  // Register the table-scoped column completion once mounted; re-register on column change.
  useEffect(() => {
    if (!ready || !mounted.current) return
    const d = registerTableColumnProvider(mounted.current.editor, mounted.current.monaco, columns)
    return () => d.dispose()
  }, [ready, columns])

  const handleMount: OnMount = (ed, m) => {
    mounted.current = { editor: ed, monaco: m }
    editorRef.current = ed
    // Enter applies — but only when the suggest widget is closed (else accept suggestion).
    ed.addCommand(m.KeyCode.Enter, () => onApplyRef.current(), 'editorTextFocus && !suggestWidgetVisible')
    setReady(true)
  }

  function handleChange(v: string | undefined): void {
    const raw = v ?? ''
    if (/[\r\n]/.test(raw)) {
      const flat = raw.replace(/[\r\n]+/g, ' ')
      editorRef.current?.setValue(flat)
      onChange(flat)
      return
    }
    onChange(raw)
  }

  return (
    <Editor
      height={26}
      language="sql"
      theme={isDark ? DARK_THEME : LIGHT_THEME}
      value={value}
      options={OPTIONS}
      onChange={handleChange}
      onMount={handleMount}
    />
  )
}
