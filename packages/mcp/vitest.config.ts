import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@watchman/mcp',
    include: ['src/**/*.test.ts'],
  },
});
