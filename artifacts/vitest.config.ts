import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'artifacts',
    include: ['*.test.tsx'],
    environment: 'node',
  },
});
