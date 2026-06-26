import type * as monaco from 'monaco-editor'
import { generateAlias, parseAliases } from './aliasParser'
import { type EditorSchema } from './schemaCache'
import { cursorContext } from './sqlContext'

const LANGUAGES = ['sql', 'pgsql', 'mysql']

/** Inline (ghost-text) provider: after `FROM <table> ` suggest a generated alias. */
export function registerAliasProvider(
  editor: monaco.editor.IStandaloneCodeEditor,
  monacoApi: typeof monaco,
  schema: EditorSchema,
): monaco.IDisposable {
  return monacoApi.languages.registerInlineCompletionsProvider(LANGUAGES, {
    provideInlineCompletions(model, position) {
      if (model !== editor.getModel()) return { items: [] }
      const ctx = cursorContext(model, position)
      // No ghost alias inside strings, comments, or subqueries.
      if (ctx.inString || ctx.inComment || ctx.parenDepth > 0) return { items: [] }

      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      // A known table immediately after FROM/JOIN, followed by exactly one space
      // (so we never re-alias once the user has typed their own alias).
      const m = /\b(?:from|join)\s+([A-Za-z_]\w*)\s$/i.exec(lineToCursor)
      if (!m) return { items: [] }
      const table = (m[1] ?? '').toLowerCase()
      if (!schema.tables.some((t) => t.name.toLowerCase() === table)) return { items: [] }

      const used = new Set(parseAliases(model.getValue()).keys())
      const alias = generateAlias(table, used)
      return {
        items: [
          {
            insertText: alias,
            range: new monacoApi.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
          },
        ],
      }
    },
    freeInlineCompletions() {
      // Nothing to dispose per-result.
    },
  })
}
