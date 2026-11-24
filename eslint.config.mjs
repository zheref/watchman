// One ESLint config for the whole monorepo.
// - Every TypeScript file gets the typescript-eslint rules Next ships (eslint-config-next/typescript).
// - apps/web additionally gets Next's core-web-vitals set (React, hooks, a11y, @next/next).
// - apps/mobile gets the same React hooks rules Next applies to apps/web (rules-of-hooks,
//   exhaustive-deps and the React Compiler checks), from eslint-plugin-react-hooks' recommended set.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx,mts}'];
const MOBILE_FILES = ['apps/mobile/**/*.{js,jsx,mjs,ts,tsx,mts}'];

const APP_SOURCE = 'apps/*/src/**/*.{ts,tsx,mts,js,mjs}';
const SHARED_WORDS = '/^(KIND_LABEL|waitedLabel|linkHost|linkDestination)$/';
const NO_COPY_OF_SHARED_WORDS = [
  {
    selector: `:matches(VariableDeclarator, FunctionDeclaration, TSDeclareFunction)[id.name=${SHARED_WORDS}]`,
    message: 'Import this from @watchman/ui: the apps keep no copy of the shared words.',
  },
  {
    selector: `ExportSpecifier[exported.name=${SHARED_WORDS}]`,
    message: 'Import this from @watchman/ui where it is used: the apps do not re-export it.',
  },
];
const NO_REACH_INTO_A_PACKAGE = {
  group: ['**/packages/*/src/**'],
  message: 'Import a workspace package by its name, never by a path into its source.',
};

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
  {
    files: MOBILE_FILES,
    ...reactHooks.configs.flat.recommended,
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
    // WM-IS-#16: the words both apps print live once, in packages/ui. An app neither declares nor
    // exports one under these names, and reaches a workspace package only by its package name. A
    // copy under another name is not something lint can see: that part rests on review.
    files: [APP_SOURCE],
    rules: {
      'no-restricted-syntax': ['error', ...NO_COPY_OF_SHARED_WORDS],
      'no-restricted-imports': ['error', { patterns: [NO_REACH_INTO_A_PACKAGE] }],
    },
  },
  {
    // Outside its tests an app also reads no host off a URL itself, and never imports the pinned
    // link table, which is test data.
    files: [APP_SOURCE],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_COPY_OF_SHARED_WORDS,
        {
          selector: "MemberExpression[property.name='hostname']",
          message: "Name a link's host with linkHost or linkDestination from @watchman/ui.",
        },
        {
          selector: "ImportExpression[source.value='@watchman/ui/testing']",
          message: 'Test data: import @watchman/ui/testing from a test file only.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@watchman/ui/testing',
              message: 'Test data: import @watchman/ui/testing from a test file only.',
            },
          ],
          patterns: [NO_REACH_INTO_A_PACKAGE],
        },
      ],
    },
  },
  {
    // packages/ui is the shared presentation layer: words and small formatters printed by both
    // apps, on Node, in the browser and on Hermes. It is plain strings and functions: framework-blind
    // as core is, and with no React either.
    files: ['packages/ui/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'next',
                'next/*',
                'expo',
                'expo-*',
                'react',
                'react/*',
                'react-native',
                'react-dom',
              ],
              message: 'packages/ui is shared by web and mobile and must stay framework-blind.',
            },
          ],
        },
      ],
    },
  },
]);
