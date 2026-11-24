# @watchman/mobile

The Watchman mobile app: Expo (SDK 58) with TypeScript and Expo Router. It shows the **Attention
tile**: the top five items that need the owner's yes, ranked by `@watchman/core`, each with its
source and as-of time and a deep link opened with `Linking.openURL`. Read-only, and synthetic data
only for now (the committed `full.json` fixture, labelled with a visible "synthetic" badge).

Run it from the repository root (npm only):

```bash
npm ci
npm run start:mobile                          # Expo dev server; open in Expo Go or a simulator
npm run typecheck --workspace @watchman/mobile
npm run build --workspace @watchman/mobile    # expo export for iOS and Android (headless)
```

Native builds are local only (`npx expo run:ios` / `npx expo run:android`); no cloud build service is
used. See [The mobile app](../../README.md#the-mobile-app) in the root README for what the screen
shows and how it reuses `packages/core`.

## Layout

- `src/app/` is the one Expo Router directory: `_layout.tsx` and `index.tsx`, which only binds the home route to `src/components/AttentionScreen.tsx`.
- `src/components/` draws the screen and the tile from a view; it holds no ranking logic.
- `src/lib/attention-view.ts` is the view-model: `@watchman/core`'s ranking and provenance turned
  into the words and figures the screen prints (stamp text, badge rule included). It is pure and unit-tested.
- `src/lib/open-link.ts` opens a deep link through an injected opener and reports the outcome; pure and unit-tested.
- `src/lib/load-attention.ts` reads the bundled synthetic fixture through core's validation.
- `src/palette.ts` and `src/theme.ts` are the Metro colours, type scale and spacing.
- `src/**/*.test.tsx` is the render lane: the screen, the tile and the route files drawn through
  `react-native-web` under happy-dom and queried by role and accessible name (value, "No data",
  manual and link-failed states). It runs in `npm test` with no simulator or device. It does not
  prove native layout, the rows' `accessibilityHint` (`react-native-web` drops it, so removing it
  would pass), the `maxFontSizeMultiplier` text-size caps, or the live region's behaviour on iOS and
  Android (`aria-live` is checked on the web form; on iOS only the stubbed `announceForAccessibility`
  call is).
