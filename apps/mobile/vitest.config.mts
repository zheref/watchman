import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineProject } from 'vitest/config';

const require = createRequire(import.meta.url);
/** A package's ES module build, which imports `react-native` (aliased below) instead of requiring it. */
const esmEntry = (pkg: string, entry: string) =>
  join(dirname(require.resolve(`${pkg}/package.json`)), entry);

// Two kinds of test share this project:
// - `src/**/*.test.ts`: the pure modules (view-model, link opener, palette) in plain Node. They
//   import `@watchman/core` and the synthetic fixture, never React Native.
// - `src/**/*.test.tsx`: the render lane for the views (`src/app`, `src/components`). Each file
//   opts into happy-dom with a `@vitest-environment` docblock, and `react-native` resolves to
//   `react-native-web`: the same components, props and accessibility roles, drawn as DOM, so
//   Testing Library can query them by role and accessible name and V8 coverage measures them in the
//   one root report. It needs no simulator, device or native toolchain (zheref/watchman#16).
export default defineProject({
  resolve: {
    // `.web.*` first, as Metro's web platform does: native-only files never load under Node.
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.json'],
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      {
        find: /^react-native-safe-area-context$/,
        replacement: esmEntry('react-native-safe-area-context', 'lib/module/index.js'),
      },
    ],
  },
  test: {
    name: '@watchman/mobile',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Libraries that import `react-native` themselves are transformed here, so the alias reaches
    // them too instead of Node loading React Native's Flow source.
    server: { deps: { inline: [/react-native-safe-area-context/] } },
  },
});
