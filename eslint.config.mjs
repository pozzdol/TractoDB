import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

/** Flat config (ESLint 9). TypeScript + the project's hard rules. */
export default [
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      /* AGENTS.md: no `any`. */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      /* AGENTS.md: no alert/confirm/prompt — build custom modals. */
      'no-alert': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]
