import type * as monaco from 'monaco-editor'
import { generateAlias, parseAliases } from './aliasParser'
import { type EditorSchema } from './schemaCache'
import { cursorContext } from './sqlContext'

const LANGUAGES = ['sql', 'pgsql', 'mysql']

// After FROM / [INNER|LEFT|RIGHT|FULL|CROSS] JOIN, optionally mid-word.
const AFTER_FROM_JOIN = /\b(?:from|(?:inner|left|right|full|cross)\s+(?:outer\s+)?join|join)\s+(\w*)$/i

/** Table/view name suggestions after FROM/JOIN; accepting inserts `name alias`. */
export function registerTableProvider(
  editor: monaco.editor.IStandaloneCodeEditor,
  monacoApi: typeof monaco,
  schema: EditorSchema,
): monaco.IDisposable {
  return monacoApi.languages.registerCompletionItemProvider(LANGUAGES, {
    triggerCharacters: [' '],
    provideCompletionItems(model, position) {
      if (model !== editor.getModel()) return { suggestions: [] }
      const ctx = cursorContext(model, position)
      if (ctx.inString || ctx.inComment) return { suggestions: [] }

      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      if (!AFTER_FROM_JOIN.test(lineToCursor)) return { suggestions: [] }

      const used = new Set(parseAliases(model.getValue()).keys())
      const word = model.getWordUntilPosition(position)
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: schema.tables.map((t) => ({
          label: t.name,
          detail: t.isView ? 'view' : 'table',
          kind: t.isView
            ? monacoApi.languages.CompletionItemKind.Interface
            : monacoApi.languages.CompletionItemKind.Struct,
          // Insert name + generated alias (1A logic): `users` → `users u`.
          insertText: `${t.name} ${generateAlias(t.name, used)}`,
          range,
        })),
      }
    },
  })
}
