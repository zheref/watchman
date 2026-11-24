# P3 mobile bundle: does `@watchman/core` need a narrower export for render targets?

Measured for zheref/watchman#16 (AC-4) on `main` at 756f684 plus that issue's render-test lane
(test-only dependencies, which the bundle does not include). Expo SDK 58, React Native 0.88.1,
Hermes, Metro's default configuration (no `metro.config.js`), Node 24, macOS. A local export into a
git-ignored scratch directory under `apps/mobile/.expo/`, deleted afterwards; nothing was uploaded.

```bash
npm run build --workspace @watchman/mobile        # expo export, iOS + Android: the .hbc as shipped
cd apps/mobile
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npx expo export --platform ios --platform android \
  --output-dir .expo/<scratch> --source-maps true --no-bytecode   # minified JS + map, for attribution
```

Per-module bytes come from the JS export's indexed source map: Metro writes one section per module,
so a module's size is the span from its section's offset to the next one.

## Sizes

| Platform | Hermes bundle (`.hbc`) | gzip -9     | Minified JS | gzip -9   | Modules in the map |
| -------- | ---------------------- | ----------- | ----------- | --------- | ------------------ |
| iOS      | 3,231,726 B            | 1,359,612 B | 2,170,588 B | 505,181 B | 1,259              |
| Android  | 3,219,765 B            | 1,358,638 B | 2,163,835 B | 502,666 B | 1,253              |

The `.hbc` sizes are the default export's, which `npm run build` writes to `apps/mobile/dist/`. An
export with `--source-maps` moves the bytecode's debug information into the map and writes a smaller
`.hbc` (2,621,212 B iOS, 2,611,380 B Android); that is not the shipped size.

## What of core lands in the bundle

Every module the barrel (`packages/core/src/index.ts`) re-exports is in both bundles, the
server-only ones included: Metro does not tree-shake by default, so `"sideEffects": false` in core's
`package.json` has no effect. Minified JS, identical on both platforms:

| Part of `@watchman/core`                                                                                                      | Bytes     | Share of the JS bundle |
| ----------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- |
| All of `src/`                                                                                                                 | 45,632 B  | 2.1%                   |
| Server-only: `adapters/` (source, file, snapshot-source, gh, exclusions, github, exports) and `snapshot-builder.ts`           | 26,450 B  | 1.2%                   |
| What the app uses or could use (snapshot, provenance, attention, rank, time, flow, spend, metrics, filters, gaps, the barrel) | 19,182 B  | 0.9%                   |
| `fixtures/synthetic/full.json` (bundled on purpose)                                                                           | 6,273 B   | 0.3%                   |
| `zod` (core's only dependency; `snapshot.ts` and `provenance.ts` validate with it, so it stays either way)                    | 537,531 B | 24.8%                  |

The server-only code also carries the literals `apps/web/scripts/check-client-bundle.mjs` forbids
in the web client bundle: both Hermes bundles contain `WATCHMAN_SNAPSHOT_DIR` and `snapshot directory
could not be listed` (from `adapters/file.ts`). They are names and messages, not data or secrets,
but the web build treats their presence as a boundary failure and the mobile build has no such check.

With Expo's experimental tree shaking (`EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1`, iOS JS export), the server-only modules drop to 0 B and core to
9,434 B, but the bundle shrinks only 21,543 B (to 2,149,045 B) and the flag is unstable and opt-in.

## Decision

**Yes: `@watchman/core` should offer a narrower export for render targets** (a subpath such as
`@watchman/core/view` carrying the snapshot model, validation, provenance, time and the per-tile
logic, without `adapters/` and `snapshot-builder`), and `apps/mobile` should import from it. It is
not built here: nothing requires it today.

The reason is the boundary, not the size. The saving is 26,450 B of minified JS, 1.2% of the bundle;
the cost that matters is that every phone build ships the server's file loader, GitHub and export
adapters and the snapshot builder, with the strings the web build already refuses to ship. A
render-only entry makes that a rule the import graph keeps, where today only the unstable
tree-shaking flag would. The subpath's name and whether presentation helpers join it follow the
topology ruling in #8; when it lands, a mobile counterpart of the web's client-bundle tripwire
should scan the export for the same forbidden literals.

Not decided here: `zod` is a quarter of the JS bundle and belongs to validation, which the app
needs; whether render targets should validate with a smaller schema library is a separate question.
