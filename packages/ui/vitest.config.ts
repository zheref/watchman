import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@watchman/ui',
    include: ['src/**/*.test.ts'],
  },
});
