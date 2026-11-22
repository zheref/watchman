import { defineConfig } from 'vitest/config';

// One Vitest run at the root covers every package; each package keeps its own vitest.config.ts.
// It also writes the two artifacts nen reads: JUnit results (nen shu test-report) and an lcov
// coverage report (nen shu coverage). Both paths are git-ignored.
export default defineConfig({
  test: {
    projects: ['packages/*'],
    reporters: ['default', ['junit', { outputFile: '.nen/test-results/vitest.xml' }]],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
