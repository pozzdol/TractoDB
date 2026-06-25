import * as monaco from 'monaco-editor'
import { parseAliases } from './aliasParser'
import { columnsFor } from './schemaCache'

const LANGUAGES = ['sql', 'pgsql', 'mysql']

/** Completion provider for `<alias>.` dot-notation → that table's columns. */
export function registerColumnProvider(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(LANGUAGES, {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position) {
      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const m = /([A-Za-z_]\w*)\.\s*$/.exec(lineToCursor)
      if (!m) return { suggestions: [] }

      const alias = (m[1] ?? '').toLowerCase()
      const table = parseAliases(model.getValue()).get(alias)
      if (!table) return { suggestions: [] }

      const columns = await columnsFor(table)
      const word = model.getWordUntilPosition(position)
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: columns.map((c) => ({
          label: c.name,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: c.name,
          detail: `${c.isPrimaryKey ? '🔑 ' : ''}${c.dataType}`,
          range,
        })),
      }
    },
  })
}
