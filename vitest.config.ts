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
        'src/types/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
    'vitest.setup.ts',
  ],
  // Coverage floor (ratchet): the suite fails if coverage drops below these.
  // Lines 70 is the project target; the others sit just under current levels.
  thresholds: {
    lines: 70,
    statements: 68,
    functions: 60,
    branches: 53,
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
