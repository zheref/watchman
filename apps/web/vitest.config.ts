import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineProject({
  resolve: {
    alias: {
      '@': src,
      // `server-only` throws outside a React Server Components build; tests run in plain Node.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    name: '@watchman/web',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
