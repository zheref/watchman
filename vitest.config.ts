import { defineConfig } from 'vitest/config';

// One Vitest run at the root covers every package and apps/web; each keeps its own vitest.config.ts.
// It also writes the two artifacts nen reads: JUnit results (nen shu test-report) and an lcov
// coverage report (nen shu coverage). Both paths are git-ignored.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    reporters: ['default', ['junit', { outputFile: '.nen/test-results/vitest.xml' }]],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: [
        'packages/*/src/**/*.ts',
        'apps/web/src/{components,lib,server,theme}/**/*.{ts,tsx}',
      ],
      // Barrels only re-export and test helpers are not product code; any other index.ts that
      // carries logic stays measured.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/src/test/**',
        'packages/core/src/index.ts',
        'packages/mcp/src/index.ts',
        'apps/web/src/components/metro/index.ts',
      ],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
