import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Explicit imports (import { describe, it, expect, vi } from 'vitest')
    // rather than ambient globals — keeps test files honestly typed without
    // adding global types to the build tsconfig.
    globals: false,
    // Let CI fail on the coverage gate (below) rather than on "no test files"
    // while the suite is still empty; real tests land in a follow-up.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        // Server bootstrap / composition root — wires Kafka, Postgres, Apollo,
        // and WebSockets together. Covered by integration rather than unit
        // tests; the testable logic it uses lives in the sibling modules.
        'src/index.ts',
      ],
      // Enforce 100% across lines, functions, branches, and statements.
      thresholds: { 100: true },
    },
  },
});
