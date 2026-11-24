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

Compressed sizes are `gzip -9 -n < <file> | wc -c` (Apple gzip 487.0.1, read from stdin with `-n`,
so the header carries no file name or time and the figure is reproducible). `gzip -9 -c <file>`
reads the file and stores its name and time, which adds a few bytes and varies between builds.

Per-module bytes come from the JS export's indexed source map: Metro writes one section per module,
so a module's size is the span from its section's offset to the next one. The snippet that did it,
run as `node attr.cjs <bundle>.js` (it reads `<bundle>.js.map` beside it):

```js
const fs = require('fs');
const js = process.argv[2];
const code = fs.readFileSync(js, 'utf8');
const { sections } = JSON.parse(fs.readFileSync(js + '.map', 'utf8'));
const lineStart = [0];
for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStart.push(i + 1);
const at = ({ line, column }) => lineStart[line] + column;
const bytes = new Map();
sections.forEach((s, i) => {
  const end = i + 1 < sections.length ? at(sections[i + 1].offset) : code.length;
  const k = s.map.sources[0] ?? '(none)';
  bytes.set(k, (bytes.get(k) ?? 0) + Buffer.byteLength(code.slice(at(s.offset), end)));
});
const sum = (re) => [...bytes].filter(([k]) => re.test(k)).reduce((n, [, b]) => n + b, 0);
console.log({
  total: Buffer.byteLength(code),
  core: sum(/packages\/core\/src\//),
  serverOnly: sum(/packages\/core\/src\/(adapters\/|snapshot-builder)/),
  zod: sum(/node_modules\/zod\//),
});
```

## Sizes

| Platform | Hermes bundle (`.hbc`) | gzip -9     | Minified JS | gzip -9   | Modules in the map |
| -------- | ---------------------- | ----------- | ----------- | --------- | ------------------ |
| iOS      | 3,231,726 B            | 1,359,566 B | 2,170,588 B | 505,139 B | 1,259              |
| Android  | 3,219,765 B            | 1,358,594 B | 2,163,835 B | 502,624 B | 1,253              |

The `.hbc` sizes are the default export's, which `npm run build` writes to `apps/mobile/dist/`. An
export with `--source-maps` moves the bytecode's debug information into the map and writes a smaller
`.hbc` (2,621,212 B iOS, 2,611,380 B Android); that is not the shipped size.

The export is not byte-reproducible: a second `npm run build` on the same tree wrote a `.hbc` under a
different content hash of 3,231,721 B iOS (gzip 1,361,614 B) and 3,219,759 B Android (gzip
1,357,310 B). Read the `.hbc` figures as ±10 B raw and ±2.1 KB compressed between builds; the gzip
method above gives the same figure every time for the same file. The minified-JS figures and every
per-module figure below were the same in both JS exports.

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
could not be listed` (from `adapters/file.ts`). Both also carry the built-in exclusion tokens,
`ALWAYS_EXCLUDED` in `packages/core/src/adapters/exclusions.ts` (each token once per `.hbc`). None of
these is data or a secret, and the tokens are already public in the source, so a phone discloses
nothing new; but the tokens are the one privacy-flavoured literal in the bundle, the web build treats
the other two as a boundary failure, and the mobile build has no such check.

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
adapters and the snapshot builder, with the strings the web build already refuses to ship and the
built-in exclusion tokens. A
render-only entry makes that a rule the import graph keeps, where today only the unstable
tree-shaking flag would. The subpath's name and whether presentation helpers join it follow the
topology ruling in #8; when it lands, a mobile counterpart of the web's client-bundle tripwire
should scan the export for the same forbidden literals and for the `ALWAYS_EXCLUDED` tokens.

Not decided here: `zod` is a quarter of the JS bundle and belongs to validation, which the app
needs; whether render targets should validate with a smaller schema library is a separate question.
