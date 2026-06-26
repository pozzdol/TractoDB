// Runnable check: `bun src/components/editor/autocomplete/aliasParser.check.ts`
import assert from 'node:assert/strict'
import { generateAlias, parseAliases } from './aliasParser'

// generateAlias rules
assert.equal(generateAlias('users'), 'u')
assert.equal(generateAlias('orders'), 'o')
assert.equal(generateAlias('model_has_roles'), 'mhr')
assert.equal(generateAlias('user_role_assignments'), 'ura')
assert.equal(generateAlias('log'), 'log') // ≤3 chars → as-is
assert.equal(generateAlias('id'), 'id')

// conflict resolution
assert.equal(generateAlias('users', new Set(['u'])), 'u2')
assert.equal(generateAlias('users', new Set(['u', 'u2'])), 'u3')

// parseAliases
const map = parseAliases('SELECT * FROM users u JOIN orders AS o ON u.id = o.user_id')
assert.equal(map.get('u'), 'users')
assert.equal(map.get('o'), 'orders')
// schema-qualified base table name is stripped
assert.equal(parseAliases('FROM public.users u').get('u'), 'users')
// keywords are not aliases
assert.equal(parseAliases('SELECT * FROM users WHERE x = 1').has('where'), false)

// eslint-disable-next-line no-console
console.log('aliasParser checks passed')
