# @watchman/web

The Watchman web dashboard: Next.js with the App Router and TypeScript, styled by a Chakra UI v3
system in the Microsoft Metro / Modern UI style. Read-only; every action is a link out.

| Route        | What it shows                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `/`          | The four tiles (Attention, Flow, Spend, Metrics), most valuable first, and "Customise tiles"    |
| `/attention` | Every item waiting on the owner, ranked by value × urgency, each with its deep link and stamp   |
| `/flow`      | Done this week against last, open work per project, stale items, the handoff board by state     |
| `/spend`     | The month's cost in USD and COP per provider, and each quota against its reset with a countdown |
| `/metrics`   | The sixteen merge-priority metrics per project with their trends, or "no data"                  |
| `/theme`     | A preview of the theme and every tile state, from a synthetic fixture                           |

| Path                                | What it holds                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `src/server/snapshot.ts`            | `server-only`: resolves `WATCHMAN_SNAPSHOT_DIR` and reads the newest snapshot      |
| `src/server/dashboard.ts`           | The cached read every route shares (`use cache`: revalidate 15 min, expire 1 h)    |
| `src/lib/tiles.ts`, `details.ts`    | Pure snapshot → tile and drill-down view models                                    |
| `src/lib/layout.ts`, `layout-store` | The tile layout model, its boot script and its `localStorage` store                |
| `src/lib/refresh.ts`                | The idle-aware self-refresh that keeps an open page under an hour old              |
| `src/components/dashboard/`         | The page shell with the data stamp, the home tiles, the layout board, table parts  |
| `src/components/metro/`             | `Tile`, `TileGrid`, `TileList`, `PivotHeader`, `PageShell` and `Provenance`        |
| `src/theme/`                        | Palette (WCAG AA accents), the Chakra system, the `metroTile`/`metroPivot` recipes |
| `scripts/check-client-bundle.mjs`   | Fails the build if the client bundle could reveal the snapshot location            |
| `e2e/`                              | Playwright checks of the acceptance criteria against the production build          |

**Where the data comes from.** With `WATCHMAN_SNAPSHOT_DIR` unset the app serves the committed
synthetic fixture (`packages/core/fixtures/synthetic/full.json`), badged "synthetic data". Set, it
reads the newest `snapshot-<ISO>.json` there (what `npm run snapshot` writes), else a hand-placed
`snapshot.json`; a directory that cannot be read turns every tile to "no data" with the reason.
The variable is read in `src/server/` only, and nothing that leaves the server names the directory.
Every relative figure (rankings, stale counts, countdowns) is measured from the snapshot's own
as-of time, so it agrees with the figures beside it.

**Look and accessibility.** Square corners, flat accents with white text at 4.5:1 or better, light
oversized figures, a Segoe UI → Selawik → Open Sans font stack (Open Sans self-hosted at build time
under the SIL Open Font Licence), visible focus rings, 44 px targets, motion only under
`prefers-reduced-motion: no-preference`, and no sideways scrolling down to 390 px (wide tables
scroll inside a named, focusable region). A tile with no data turns grey, says "No data" and why,
and never shows a number.

Run it from the repository root (npm only):

```bash
npm ci
npm run dev:web                              # http://127.0.0.1:3000 (loopback only)
npm run build                                # production build + client-bundle check
npm run start --workspace @watchman/web      # serve the production build on 127.0.0.1
npm run e2e --workspace @watchman/web        # Playwright against the production build (local)
npm test                                     # unit tests, this app's included
```

`npm run e2e` uses the installed Google Chrome and downloads nothing (`PW_CHANNEL=chromium` uses
Playwright's own browser instead); it is a local check, not part of CI. See the
[root README](../../README.md) for the whole monorepo, deploying, and its public-repo safeguards.
