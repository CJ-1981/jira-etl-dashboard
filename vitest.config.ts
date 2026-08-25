import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '.next/',
        'prisma/generated/',
        'src/types/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
    'vitest.setup.ts',
  ],
  // Coverage floor (ratchet): the suite fails if coverage drops below these.
  // Tightened 2026-08 after phase 9. Floors sit slightly under the local
  // (Windows) v8 measurements because the Linux CI runner measures a fraction
  // lower for the same code (lines 74.87 vs 75.11 locally at this commit).
  thresholds: {
    lines: 74,
    statements: 73,
    functions: 66,
    branches: 60,
  },
},
    include: ['**/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}', '**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Keep Playwright e2e specs out of vitest — they import @playwright/test,
    // whose test.describe() is not callable from the vitest runner.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
    ],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
