# @watchman/mobile

The Watchman mobile app: Expo with TypeScript. Scaffold only for now; it will reuse `@watchman/core`
and show the Attention tile.

Run it from the repository root (npm only):

```bash
npm ci
npm run start:mobile     # Expo dev server; open in Expo Go or a simulator
npm run typecheck --workspace @watchman/mobile
```

Native builds are local only (`npx expo run:ios` / `npx expo run:android`); no cloud build service is
used. See the [root README](../../README.md) for the whole monorepo.
