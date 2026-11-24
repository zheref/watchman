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
  {
    // packages/core is shared by web, mobile (Hermes) and the MCP server, so it stays
    // framework-blind: no Node built-ins, no Next, Expo, React Native or React DOM.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'next', 'next/*', 'expo', 'expo-*', 'react-native', 'react-dom'],
              message: 'packages/core must stay framework-blind (RC-50).',
            },
          ],
        },
      ],
    },
  },
  {
    // WM-IS-#16: the words both apps print live once, in packages/ui. An app declares no copy of
    // them, under these names, anywhere in its source.
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':matches(VariableDeclarator, FunctionDeclaration)[id.name=/^(KIND_LABEL|waitedLabel|linkHost|linkDestination)$/]',
          message: 'Import this from @watchman/ui: the apps keep no copy of the shared words.',
        },
      ],
    },
  },
  {
    // The pinned link table is test data: only a test may import it.
    files: ['apps/*/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@watchman/ui/testing',
              message: 'Test data: import @watchman/ui/testing from a test file only.',
            },
          ],
        },
      ],
    },
  },
  {
    // packages/ui is the shared presentation layer: words and small formatters printed by both
    // apps, on Node, in the browser and on Hermes. It stays as framework-blind as core.
    files: ['packages/ui/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'next', 'next/*', 'expo', 'expo-*', 'react-native', 'react-dom'],
              message: 'packages/ui is shared by web and mobile and must stay framework-blind.',
            },
          ],
        },
      ],
    },
  },
]);
