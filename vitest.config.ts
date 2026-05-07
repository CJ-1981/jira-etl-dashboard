import { defineConfig } from 'vitest/config';

// @MX:ANCHOR: Vitest configuration with native tsconfig path resolution
export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
