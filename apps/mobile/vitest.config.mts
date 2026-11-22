import { defineProject } from 'vitest/config';

// Only the pure modules are unit-tested (the view-model and the palette). They import
// `@watchman/core` and the synthetic fixture, never React Native, so plain Node runs them.
export default defineProject({
  test: {
    name: '@watchman/mobile',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
