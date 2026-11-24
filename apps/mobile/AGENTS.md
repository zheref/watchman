This is the Watchman Expo/React Native app. It reuses `@watchman/core` (ranking, validation and
provenance are imported, never copied) and shows the Attention tile. Prioritize mobile-first patterns, performance, and cross-platform
compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or
removed. Before writing any code that touches an Expo or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with
   corrections to common LLM misconceptions. Follow its links to the specific page you need; never
   answer from memory.

## Repository rules (these override generic Expo advice)

- **npm only.** Never use pnpm, yarn or bun, and never commit their lockfiles. The one lockfile is
  the repository root's `package-lock.json`; run installs from the root.
- **Local builds only.** Build with `npx expo run:ios` / `npx expo run:android` on your own machine.
  No EAS cloud builds, submissions or updates, and no other paid build service.
- **Expo Router, one route directory.** The entry is `expo-router/entry` (`main` in `package.json`);
  routes live only in `src/app/` with its `_layout.tsx`. Keep screens thin: logic goes in
  `src/lib/` as pure, unit-tested modules (the Vitest project runs `src/**/*.test.ts` in plain Node,
  so a tested module must not import `react-native`).
- **Views are render-tested.** `src/**/*.test.tsx` is the render lane: happy-dom, with
  `react-native` resolved to `react-native-web` (`vitest.config.mts`), queried with
  `@testing-library/react` by role and accessible name. Nothing in `src/app/` may be a test (every
  file there is a route), so route files are tested from `src/routes.test.tsx`. Coverage measures
  `src/app` and `src/components` in the root report; they are not exempt.
- **No `metro.config.js`.** Expo's Metro config handles npm workspaces itself (SDK 52+); add one only
  for a need it cannot meet.
- **Read-only, public repository.** No secrets, tokens or real data in this app's code or assets.

## Commands

```bash
npx expo install <package>          # resolves SDK-compatible versions; run from apps/mobile
npm run start:mobile                # from the repository root: the Expo dev server
npm run typecheck --workspace @watchman/mobile
npm run build --workspace @watchman/mobile    # expo export (iOS + Android), the headless build proof
npm run lint                        # from the repository root: one ESLint + Prettier config
npx expo-doctor                     # diagnose dependency and config issues
```

Run lint and typecheck before declaring any task done.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native
  Generation). Never create or edit them by hand — configure native behavior in `app.json` and
  config plugins. Both are git-ignored.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app
  needs a development build: `npx expo run:ios|android` locally.
- Prefer recommended Expo modules over third-party libraries. Docs:
  https://docs.expo.dev/versions/latest/index.md
