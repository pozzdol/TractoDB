import type * as monaco from 'monaco-editor'

interface CursorContext {
  inString: boolean
  inComment: boolean
  /** Unbalanced '(' open before the cursor — > 0 means inside a subquery/paren group. */
  parenDepth: number
}

/**
 * Classify the cursor position by scanning the document from the start up to it.
 * Used to suppress autocomplete inside string literals, comments, and subqueries.
 * ponytail: single pass over the doc prefix — fine for editor-sized text.
 */
export function cursorContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): CursorContext {
  const text = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  let inString = false
  let inLine = false
  let inBlock = false
  let quote = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const n = text[i + 1]
    if (inLine) {
      if (c === '\n') inLine = false
      continue
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      if (c === quote) inString = false
      continue
    }
    if (c === '-' && n === '-') {
      inLine = true
      i++
    } else if (c === '/' && n === '*') {
      inBlock = true
      i++
    } else if (c === "'" || c === '"' || c === '`') {
      inString = true
      quote = c
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth = Math.max(0, depth - 1)
    }
  }
  return { inString, inComment: inLine || inBlock, parenDepth: depth }
}
