import { defineConfig } from 'vitest/config';

// Relatieve base: werkt op GitHub Pages onder /<repo-naam>/ én lokaal.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
