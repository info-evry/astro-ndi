import { defineConfig } from 'vitest/config';

/**
 * DOM test project: client-side modules that need `document`/`window`.
 * The worker pool (vitest.config.js) has no DOM, so these tests live in
 * test/dom/ and run in happy-dom, with no Cloudflare bindings.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['test/dom/**/*.test.js'],
    setupFiles: ['./test/dom/setup.js'],
    exclude: ['**/node_modules/**'],
    testTimeout: 15_000,
    restoreMocks: true,
    unstubGlobals: true
  }
});
