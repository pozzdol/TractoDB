import type * as monaco from 'monaco-editor'
import { cursorContext } from './sqlContext'

const LANGUAGES = ['sql', 'pgsql', 'mysql']

/**
 * Bare column-name completion scoped to one editor (the Column SQL bar). Unlike
 * columnProvider (which needs `alias.`), this offers the current table's columns
 * directly — type `age` and the `age` column appears.
 */
export function registerTableColumnProvider(
  editor: monaco.editor.IStandaloneCodeEditor,
  monacoApi: typeof monaco,
  columns: string[],
): monaco.IDisposable {
  return monacoApi.languages.registerCompletionItemProvider(LANGUAGES, {
    provideCompletionItems(model, position) {
      if (model !== editor.getModel()) return { suggestions: [] }
      const ctx = cursorContext(model, position)
      if (ctx.inString || ctx.inComment) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: columns.map((c) => ({
          label: c,
          kind: monacoApi.languages.CompletionItemKind.Field,
          insertText: c,
          detail: 'column',
          range,
        })),
      }
    },
  })
}
