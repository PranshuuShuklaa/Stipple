import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // `import 'server-only'` is a no-op under Node; Next bundles the shim.
      'server-only': path.resolve(import.meta.dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
  },
})
