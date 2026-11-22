// One ESLint config for the whole monorepo.
// - Every TypeScript file gets the typescript-eslint rules Next ships (eslint-config-next/typescript).
// - apps/web additionally gets Next's core-web-vitals set (React, hooks, a11y, @next/next).
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx,mts}'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.expo/**',
    '**/web-build/**',
    'apps/web/next-env.d.ts',
    'apps/mobile/expo-env.d.ts',
    '.claude/**',
    'Reports/**',
    '.nen/**',
    // Rendered by hatsu:tenkai; must stay byte-identical to the rendering.
    'scripts/readiness_ci_verdict.mts',
    'scripts/consumer_trailer_ci.mts',
  ]),
  {
    files: WEB_FILES,
    extends: [nextVitals],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  ...nextTs,
]);
