/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Explicit imports (import { describe, it, expect } from 'vitest') rather
    // than ambient globals — keeps test files honestly typed without polluting
    // tsconfig with global types.
    globals: false,
    css: false,
    // Let CI fail on the coverage gate (below) rather than on "no test files"
    // while the suite is still empty; real tests land in a follow-up.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.tsx', // render bootstrap — exercised by the browser, not unit tests
        'src/test/**',
      ],
      // Enforce 100% across lines, functions, branches, and statements.
      thresholds: { 100: true },
    },
  },
});
