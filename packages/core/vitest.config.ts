import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@watchman/core',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
