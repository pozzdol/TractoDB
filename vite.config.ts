import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'

// Native / Node-only modules must never be bundled into the main process —
// they are loaded at runtime by Electron's Node.
const nativeDeps = [
  'electron',
  'pg',
  'mysql2',
  'better-sqlite3',
  'ioredis',
  'ssh2',
  'keytar',
  'electron-store',
]

// Externalise the bare package AND any subpath import (e.g. "mysql2/promise"),
// otherwise Rollup inlines the subpath and bloats / breaks the main bundle.
// Our own source (relative/absolute paths, *.ts) is never external — without
// this guard "electron/preload.ts" would match the "electron" dep.
const isExternal = (id: string): boolean => {
  if (id.startsWith('.') || id.startsWith('/') || /\.tsx?$/.test(id)) return false
  return nativeDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))
}

export default defineConfig(({ command }) => {
  const isServe = command === 'serve'

  return {
    // Relative base so the packaged renderer loads assets over file:// (main.ts
    // uses loadFile in production). Dev server stays at '/'.
    base: isServe ? '/' : './',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          onstart: ({ startup }) => {
            void startup()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: isServe,
              minify: !isServe,
              rollupOptions: {
                external: isExternal,
                // CommonJS output: Electron loads main.js as CJS (no
                // "type": "module" in package.json).
                output: { format: 'cjs', entryFileNames: '[name].js' },
              },
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: isServe ? 'inline' : false,
              minify: !isServe,
              rollupOptions: {
                external: isExternal,
                // Sandboxed preloads must be CommonJS.
                output: { format: 'cjs', entryFileNames: '[name].js' },
              },
            },
          },
        },
        // Allow `import` of native modules from the renderer-side preload safely.
        renderer: {},
      }),
      renderer(),
    ],
    assetsInclude: ['**/*.svg'],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Monaco is a large but lazy-loaded chunk — don't warn about it.
      chunkSizeWarningLimit: 4000,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    clearScreen: false,
  }
})
