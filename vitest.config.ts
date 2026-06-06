import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // we test pure logic; chrome.* APIs are mocked
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/manifest.json', 'src/assets/**'],
    },
  },
  resolve: {
    alias: {
      // Match the relative imports used in src/ — no aliases needed because
      // source already uses relative paths. Add here only if you introduce them.
    },
  },
});
