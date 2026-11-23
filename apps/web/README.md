# @watchman/web

The Watchman web app: Next.js with the App Router and TypeScript, styled by a Chakra UI v3 system in
the Microsoft Metro / Modern UI style. The home view is a placeholder until the dashboard tiles land;
`/theme` previews the theme and every tile state from a synthetic fixture.

| Path                     | What it holds                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| `src/theme/palette.ts`   | Accent and neutral colours (all WCAG AA with their text), font stacks, contrast |
| `src/theme/system.ts`    | The Chakra system: tokens, semantic tokens, text styles, keyframes, recipes     |
| `src/theme/recipes/`     | The `metroTile` and `metroPivot` slot recipes                                   |
| `src/components/metro/`  | `Tile`, `TileGrid`, `PivotHeader`, `PageShell` and the `Provenance` stamp       |
| `src/lib/tiles.ts`       | Pure snapshot → tile view models                                                |
| `src/server/snapshot.ts` | The `server-only` file adapter wired to `WATCHMAN_SNAPSHOT_DIR`                 |

Look and accessibility rules the primitives keep: square corners (every radius token is zero), flat
accents with white text at 4.5:1 or better (`src/theme/contrast.test.ts`), light oversized figures,
a Segoe UI → Selawik → Open Sans font stack (Open Sans is self-hosted at build time under the SIL
Open Font Licence), visible focus rings, and motion only under `prefers-reduced-motion:
no-preference`. A tile with no data turns grey, says "No data" and why, and never shows a number.

Run it from the repository root (npm only):

```bash
npm ci
npm run dev:web          # http://localhost:3000 and http://localhost:3000/theme
npm run build            # production build
npm test                 # includes this app's tests
```

See the [root README](../../README.md) for the whole monorepo and its public-repo safeguards.
