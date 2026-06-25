import * as monaco from 'monaco-editor'
import { generateAlias, parseAliases } from './aliasParser'
import { getSchemaContext } from './schemaCache'

const LANGUAGES = ['sql', 'pgsql', 'mysql']

/** Inline (ghost-text) provider: after `FROM <table> ` suggest a generated alias. */
export function registerAliasProvider(): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider(LANGUAGES, {
    provideInlineCompletions(model, position) {
      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      // A known table immediately after FROM/JOIN, followed by exactly one space.
      const m = /\b(?:from|join)\s+([A-Za-z_]\w*)\s$/i.exec(lineToCursor)
      if (!m) return { items: [] }
      const table = m[1] ?? ''
      if (!getSchemaContext().tableNames.includes(table.toLowerCase())) return { items: [] }

      const used = new Set(parseAliases(model.getValue()).keys())
      const alias = generateAlias(table, used)
      return {
        items: [
          {
            insertText: alias,
            range: new monaco.Range(
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
