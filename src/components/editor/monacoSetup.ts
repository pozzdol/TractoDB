import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'
import { registerColumnProvider } from './autocomplete/columnProvider'
import { registerAliasProvider } from './autocomplete/aliasProvider'

// SQL needs only the base editor worker (no language-service workers).
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

export const LIGHT_THEME = 'dbstudio-light'
export const DARK_THEME = 'dbstudio-dark'

// SQL keyword set for autocomplete (kept small and common).
const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
  'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'COUNT', 'SUM',
  'AVG', 'MIN', 'MAX', 'ASC', 'DESC', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT',
]

// Schema source for autocomplete — set by the focused editor to its connection.
let completionSource: { tables: string[]; columns: string[] } = { tables: [], columns: [] }

export function setCompletionSource(source: { tables: string[]; columns: string[] }): void {
  completionSource = source
}

let initialised = false

export function setupMonaco(): void {
  if (initialised) return
  initialised = true

  loader.config({ monaco })

  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '185FA5' },
      { token: 'operator', foreground: '444444' },
      { token: 'string', foreground: '854F0B' },
      { token: 'number', foreground: '8B3A8B' },
      { token: 'comment', foreground: '888888', fontStyle: 'italic' },
      { token: 'predefined', foreground: '0F6E56' },
      { token: 'type', foreground: '0F6E56' },
      { token: 'identifier', foreground: '1A1A1A' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#1A1A1A',
      'editorLineNumber.foreground': '#999999',
      'editor.lineHighlightBackground': '#F7F7F6',
      'editorCursor.foreground': '#185FA5',
      'editor.selectionBackground': '#E6F1FB',
    },
  })

  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '4A9FE0' },
      { token: 'operator', foreground: 'AAAAAA' },
      { token: 'string', foreground: 'E8A44A' },
      { token: 'number', foreground: 'C792EA' },
      { token: 'comment', foreground: '666666', fontStyle: 'italic' },
      { token: 'predefined', foreground: '3DBFA0' },
      { token: 'type', foreground: '3DBFA0' },
      { token: 'identifier', foreground: 'E8E8E8' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#E8E8E8',
      'editorLineNumber.foreground': '#666666',
      'editor.lineHighlightBackground': '#252525',
      'editorCursor.foreground': '#4A9FE0',
      'editor.selectionBackground': '#0C2A42',
    },
  })

  for (const language of ['sql', 'pgsql', 'mysql']) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: [' ', '.'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const suggestions: monaco.languages.CompletionItem[] = [
          ...KEYWORDS.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
          })),
          ...completionSource.tables.map((t) => ({
            label: t,
            detail: 'table',
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: t,
            range,
          })),
          ...completionSource.columns.map((c) => ({
            label: c,
            detail: 'column',
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: c,
            range,
          })),
        ]
        return { suggestions }
      },
    })
  }

  // Smart alias-aware providers (Feature 4).
  registerColumnProvider()
  registerAliasProvider()
}
