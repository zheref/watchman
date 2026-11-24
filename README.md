# Watchman

Watchman is a personal, single-user executive dashboard. It answers one question quickly:
_what needs my attention right now, and how is everything else going?_ It is **read-only** by
design: it shows state and links out to wherever an item can be acted on, but it never approves,
merges, halts or pays for anything itself.

The home screen is four tiles, each of which opens a drill-down view:

| Tile          | Shows                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| **Attention** | the few items that are waiting on the owner, ranked, each one click away      |
| **Flow**      | how work is moving: open, stale and finished work, this week against the last |
| **Spend**     | AI and compute usage against each provider's quota reset, plus monthly cost   |
| **Metrics**   | quality-metric trends per project; shows "no data" until a real feed exists   |

Every figure carries its source and an as-of time, and missing data is labelled as missing rather
than filled in.

## Roadmap

| Version | What it is                                                                      |
| ------- | ------------------------------------------------------------------------------- |
| v0      | a Claude artifact rendering the four tiles from a local snapshot                |
| v1      | the Next.js web app in `apps/web`                                               |
| v1      | a read-only MCP server in `packages/mcp`, so agents can read the same views     |
| v1      | an Expo app in `apps/mobile` that shows the Attention tile from `packages/core` |

The workspace, tooling and CI are in place, along with the Metro theme, the shared domain model,
the synthetic fixtures, the v0 artifact (`artifacts/watchman-v0.tsx`), the `npm run snapshot`
builder that feeds it, and the v1 web dashboard (the home view with the four tiles, their
drill-downs and layout customisation; see [The web dashboard](#the-web-dashboard)), and the
read-only MCP server (see [The MCP server](#the-mcp-server)), and the Expo app's Attention tile (see
[The mobile app](#the-mobile-app)).

## Layout

This is one npm-workspaces monorepo (npm only: no pnpm, yarn or bun, and one root
`package-lock.json`).

| Path            | Package            | What it is                                                                                                                                        |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`      | `@watchman/web`    | Next.js (App Router, TypeScript): the dashboard (home, four drill-downs) on the Chakra UI v3 Metro theme; `/theme` previews the primitives.       |
| `apps/mobile`   | `@watchman/mobile` | Expo (TypeScript, Expo Router): the Attention tile on a phone, from the synthetic fixture.                                                        |
| `packages/core` | `@watchman/core`   | The versioned `Snapshot` model and its validation, the Attention ranking and Flow/Spend/Metrics helpers, source adapters and synthetic fixtures.  |
| `packages/mcp`  | `@watchman/mcp`    | The read-only MCP server: four tools (attention, flow, spend, metrics) over the snapshot, stdio only. Its contract is `packages/mcp/CONTRACT.md`. |
| `packages/ui`   | `@watchman/ui`     | The shared presentation layer: the words and small formatters both apps print (`KIND_LABEL`, `waitedLabel`, `linkHost`, `linkDestination`).       |
| `artifacts`     | (not a package)    | `watchman-v0.tsx`, the single-file Claude artifact (v0), and the test that keeps it in step with `packages/core`.                                 |

`packages/core/scripts/` holds the one Node entry point, the `npm run snapshot` command. It sits
outside `src/` (which stays free of platform APIs, as the lint rule enforces) and has its own
tsconfig; whether it should become its own package is part of the topology question in #8.
`artifacts/` declares no dependencies of its own: its React, React DOM and React types resolve
from the root `node_modules`, where `apps/web` installs them.

Shared tooling lives at the root: `tsconfig.base.json` (every workspace extends it), one
`eslint.config.mjs` (typescript-eslint everywhere, plus Next's rules for `apps/web`), one Prettier
config, and a Vitest config that runs every `packages/*` project, `apps/web`, `apps/mobile` and `artifacts`.

### The snapshot model

Everything the dashboard shows comes from one versioned document, the **snapshot**
(`packages/core/src/snapshot.ts`), with four sections: Attention, Flow, Spend and Metrics.

- Every figure lives in a record that carries its `source` and `as_of` (ISO 8601 with an offset).
  A record that could not be observed is an explicit `{ "state": "no_data", "reason": … }` record,
  never a zero or a placeholder. Hand-typed figures carry `"manual": true`.
- `parseSnapshot` validates untrusted input: unknown versions and keys, non-`https` links, links
  carrying credentials, and stamps later than the snapshot are refused. `collectSnapshot` runs the
  configured **source adapters**, validates each report, and merges the valid ones. An adapter that
  fails or reports something invalid is listed in `failures`; that list is how a caller knows a
  merged section may be incomplete.
- A figure combined from several records (a total, a count across projects) carries their
  combined stamp: the **oldest** `as_of`, every source, and `manual` if any part was typed in.
- Week and month boundaries are UTC unless the caller passes the owner's `utcOffsetMinutes`. A
  built snapshot carries the owner's offset as `utc_offset_minutes`, and the artifact honours it.
- A built snapshot also lists its `sources`: each adapter, the sections it `feeds`, its `status`
  (`value`, `no_data` or `failed`) and the reason. That is how a reader of the file alone can tell
  a complete section from one merged without a source that failed or had no data.
- Reading: `readLatestSnapshot` reads the newest usable `snapshot-<ISO>.json` (else
  `snapshot.json`) from the directory in `WATCHMAN_SNAPSHOT_DIR` (server-side only, no default),
  with file reading injected and no path in any message; the web app reads through it, and the
  MCP server will too.
- The adapters: a **file** adapter that reports one named snapshot file as a source, a read-only
  **GitHub** adapter, four **manual-export** adapters and a Metrics placeholder that always
  reports "no data". The last six are what `npm run snapshot` runs; see
  [Building a real snapshot](#building-a-real-snapshot).
- Seven synthetic fixtures live in `packages/core/fixtures/synthetic/` (full, sparse, empty, mixed
  stamps, overflow, past reset, manual only). They are for tests and the `/theme` preview only; a
  test validates every one and checks it is marked synthetic and links only to `example.com`.

Two choices here differ from the `react-uzf-v1` handbook and are part of the ruling tracked in #8:
`packages/core` depends on `zod` (framework-free) for runtime validation, beyond RC-50's
allowlist; and the versioned snapshot document is both the wire format and the domain type that
consumers read (UZF-17 separates the two), because the document is itself the product's contract.

The stack handbook this repository resolves is `react-uzf-v1`. Its monorepo topology (RC-49 to
RC-51) differs from this layout (an MCP package, npm workspaces, no Redux or shared-UI tier); the
ruling on that difference is tracked in #8.

## Building a real snapshot

`npm run snapshot` builds a snapshot from the owner's real sources and writes it **outside** the
repository, as `snapshot-<ISO>.json` (for example `snapshot-2026-01-14T15-00-00Z.json`).

```bash
WATCHMAN_SNAPSHOT_DIR=/path/outside/the/repo npm run snapshot   # or:
npm run snapshot -- --out /path/outside/the/repo [--no-github]
```

- **Where it goes.** `--out` wins over `WATCHMAN_SNAPSHOT_DIR`; with neither, the command stops
  (exit 2). There is no default location. A directory inside this repository, or inside any of
  its git worktrees (symlinks resolved), is refused (exit 3) and nothing is read or written. The
  directory is created owner-only if missing, the file is written owner-readable, and an existing
  file is never overwritten.
- **What it prints.** Only the snapshot's shape: which sections hold values, list sizes, and which
  sources had no data or failed. Figures, titles and names stay in the file, and an error names
  no path and quotes no `gh` output (only the command and its exit status, or a file error's code).
- **Exit codes.** `0` written; `4` written, but a source failed (the snapshot's `sources` say which,
  and the tiles it feeds read "partial"); `2` no directory or a bad argument; `3` the directory is
  inside a checkout, or the checkouts could not be listed (it fails closed); `1` nothing was
  written (a config, read or write error).
- **Sources.** Each is an adapter in `packages/core/src/adapters/`. A later source (analytics, a
  real scorecard) is a new adapter added to `snapshotAdapters` (replacing the `scorecard`
  placeholder, since adapter ids are unique), plus its own key in the config schema if it needs
  settings.
- **The web app** reads the newest `snapshot-<ISO>.json` in `WATCHMAN_SNAPSHOT_DIR` (a hand-placed
  `snapshot.json` when there is none) on the server, re-reading it within the hour; how old the
  snapshot itself is depends on how often `npm run snapshot` runs. See
  [The web dashboard](#the-web-dashboard).

| Source              | Adapter             | Feeds                                                                                                                                                                 | When it is missing                     |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| GitHub              | `github`            | Flow: open PRs and issues per repository, merged PRs and completed issues (throughput), stale items. Attention: PRs open over 48h, PRs requesting the owner's review. | `gh` not signed in: listed as failed   |
| Handoff board       | `handoff-board`     | Flow: the board's columns and its cards. Attention: blocked cards and cards that need the owner.                                                                      | "no data", naming `handoff-board.json` |
| AI-services tracker | `ai-services`       | Flow: tracker entries. Attention: blocked entries and entries that need the owner.                                                                                    | "no data", naming `ai-services.json`   |
| Cloud-runs tracker  | `cloud-runs`        | The same, from `cloud-runs.json`.                                                                                                                                     | "no data", naming `cloud-runs.json`    |
| AI-surfaces sheet   | `ai-surfaces-spend` | Spend: each provider's quota against its reset, and its monthly USD and COP cost.                                                                                     | "no data", naming the file             |
| Scorecard           | `scorecard`         | Metrics: always "no data" until a scorecard source exists. It never invents a value.                                                                                  | always "no data"                       |

### GitHub

The adapter runs the `gh` CLI the owner is already signed in to, through a guard that allows only
reads: `gh api` with a plain REST path and no method, body, header or input flag (so only a GET),
and `gh repo list`, `gh pr list` and `gh issue list`, each with an explicit allow-list of flags.
Every other command or flag, bundled or attached short flags included, and GraphQL, is refused. It reads the repositories of one **personal account** (the signed-in one
unless the config names another) and refuses an organisation. Archived repositories and forks
are skipped unless the config includes them, and repositories with issues turned off are not
asked for issues. A PR's milestone due date becomes its Attention deadline.

**Built-in exclusion.** Any repository whose owner or name contains `globallogic` or `insulet`,
or that is a fork of one that does, is dropped from the repository list before anything else about
it is read. Then, before the file is written, every record of the merged snapshot that mentions
either (from any source, the manual exports included) is removed. Matching ignores case, spacing,
punctuation, full-width and zero-width characters. This cannot be switched off.

### The config file

An optional `watchman.config.json` in the snapshot directory (never committed with real values;
a synthetic example is `packages/core/fixtures/synthetic/exports/watchman.config.json`):

```json
{
  "github": {
    "enabled": true,
    "owner": "sample-owner",
    "exclude": ["old-experiment", "scratch-*", "sample-owner/private-notes"],
    "includeArchived": false,
    "includeForks": false
  },
  "utcOffsetMinutes": -300
}
```

`exclude` takes exact names, `owner/name` pairs and globs (`*`, `?`), case-insensitive.
`utcOffsetMinutes` sets where the owner's week starts for the GitHub read window, and is written
into the snapshot as `utc_offset_minutes` so the artifact counts weeks and months the same way.

### The manual export formats

The handoff board, the two trackers and the spend sheet are not reached directly (no tokens, no
calls to the services that hold them). The owner exports each one as JSON into the snapshot
directory under the file name below; every figure read from it is marked `manual`. Synthetic
examples of all four live in `packages/core/fixtures/synthetic/exports/`, and the zod schemas in
`packages/core/src/adapters/exports.ts` are the reference. Every file carries `"export"` (its kind),
`"version": 1`, `"as_of"` (when it was exported, ISO 8601 with an offset) and optionally `"source"`
(a label; `manual:<file>` otherwise). Unknown keys are refused, and links must be `https` with no
credentials.

- **`handoff-board.json`** (`"export": "handoff-board"`): optional `columns` (board order) and
  `cards`, each `{ id, title, project, url, column, opened_at, updated_at, completed_at?, blocked?,
needs_owner?, value? (1–5, default 3), waiting_since? (default updated_at), due_at? }`.
- **`ai-services.json`** and **`cloud-runs.json`** (`"export": "ai-services"` / `"cloud-runs"`):
  `items`, each with the same fields as a card but `status` instead of `column`.
- **`ai-surfaces-spend.json`** (`"export": "ai-surfaces-spend"`): `providers`, each
  `{ id, label, quota?: { used, limit, unit, resets_at, period_days? (default 7), as_of? },
quota_missing?, monthly_cost?: { month (YYYY-MM), usd, cop, as_of? }, cost_missing? }`. A missing
  reading is "no data", with `quota_missing` / `cost_missing` as its reason.

## The v0 artifact

`artifacts/watchman-v0.tsx` is a single-file React component for a claude.ai artifact: it imports
only React, makes no network calls and uses no browser storage. Paste the whole file into a new
React artifact. It opens on the embedded **synthetic** sample (the committed `full.json` fixture,
badged "synthetic"). To see real data:

1. Run `npm run snapshot` as above.
2. In the artifact, choose **Load snapshot**, paste the contents of the new `snapshot-<ISO>.json`
   and choose **Render this snapshot**. The JSON is validated first; a bad paste is refused with
   the problems listed and the current view kept. The pasted data stays in the page's memory.

Every figure shows its source and as-of time, missing data reads "no data" with its reason,
hand-typed figures are marked "manual", and every Attention item links to where it is acted on. A
tile fed by a source that failed reads "partial: <source> failed", and one fed by a source with no
data lists it as missing, from the snapshot's `sources`. Weeks and months follow the snapshot's
`utc_offset_minutes`, and every tile is shown as at the moment the snapshot was taken. Flow names
its eight busiest projects and counts the rest in its totals.

The file is TypeScript with the automatic JSX runtime (hooks imported by name, no default `React`
import). Whether claude.ai accepts it as pasted is confirmed when the owner first pastes it.

`artifacts/watchman-v0.test.tsx` keeps the copy honest. It checks that the file:

- type-checks on its own with React and the DOM only;
- imports only React and touches no network or storage API;
- embeds a sample equal to the committed fixture;
- copies every core constant unchanged.

It then runs the artifact's validator against core's on every fixture, on more than 3,000
single-value mutations of `full.json` and on edge-case dates, and checks that the tile logic (the
ranking, throughput, staleness, totals, countdowns and stamps) matches core's. That logic is
checked over a ten-day sweep in three UTC offsets and on a snapshot built from every synthetic
source.

## The web dashboard

`apps/web` is the v1 dashboard: one screen that says what needs the owner's yes, how work flows,
what AI costs against each quota reset, and how quality trends. It is read-only: every item links
out to where it is revised, halted or unblocked, and there is no approve, merge, halt or pay
control anywhere.

- **Home (`/`).** Four Metro tiles, most valuable first: **Attention** (the top five items waiting
  on the owner, ranked by value and urgency in `packages/core`, each a link to where it is acted
  on), **Flow** (done this week against last, open PRs and issues, stale items over three days, the
  handoff board by state, the busiest projects), **Spend** (the month's cost in USD and COP, each
  provider's quota against its reset with a countdown) and **Metrics** (projects reporting the
  sixteen merge-priority metrics; "no data" until a scorecard source exists, never invented
  values). Every tile carries its source and as-of stamp, marks manual and partial figures, and the
  page shows the data's as-of time, its source, when the server last read it, and a "synthetic
  data" badge on synthetic data.
- **Drill-downs.** Each tile's title opens its view: `/attention` (every eligible item, ranked,
  with value × urgency), `/flow` (per project, stale items, the board), `/spend` (per-provider cost
  and quota with meters) and `/metrics` (sixteen metrics per project with trends). The pivot and a
  "Back to start" link lead back.
- **Layout.** "Customise tiles" shows, hides and reorders the tiles (checkboxes and move buttons,
  all keyboard operable, changes announced), with a reset. The layout is kept in this browser's
  `localStorage` (single user). An inline script in the root layout applies the saved layout as
  CSS before the first paint, so a customised home never flashes the default; the server always
  renders the default order, so hydration never mismatches.
- **Data, server-side only.** Server components read the snapshot through `packages/core` in
  `src/server/` (`server-only`): the newest `snapshot-<ISO>.json` in `WATCHMAN_SNAPSHOT_DIR`, or the
  committed synthetic fixture `full.json` when the variable is unset. A newest file that is
  half-written or invalid is passed over for the one before it, with a notice; a configured
  directory that cannot be read shows every tile as "no data" with the reason, never the fixture.
- **Freshness.** The read is cached with `use cache` and `cacheLife` (revalidate 15 minutes,
  expire 1 hour; the build output lists each route at `Revalidate 15m, Expire 1h`): a request
  after 15 minutes is served the cached read while a fresh one renders, and nothing over an hour
  old is ever served. An open page reloads itself after 20 minutes, once the tab is hidden or the
  reader has been idle for 2 minutes (it never reloads under someone reading or typing), so what is
  on screen stays under an hour old. The page's "refreshed" stamp says when its read happened;
  the data's own as-of time says how old the snapshot is.
- **Nothing reaches a browser that names the data's location.** `npm run build` ends with
  `scripts/check-client-bundle.mjs`, a tripwire over the build output: it fails if the client
  bundle names the variable, Node's file system or the loader's error text, or (when the build
  ran with the variable set) contains any spelling of its value in the client bundle or a
  prerendered page. Pages rendered later at runtime are covered by the source-side guards
  (`server-only`, `src/server/boundary.test.ts`) and by messages that carry file names and error
  codes only.
- **Checks in a browser (local, not CI).** `npm run build && npm run e2e --workspace @watchman/web`
  runs Playwright against the production build on the installed Chrome: the four tiles, every
  Attention deep link, each drill-down and the way back, no sideways scrolling at 390 px and
  1440 px (with screenshots), keyboard layout customisation kept across a reload with no flash,
  and home-view timings.

### Deploying (owner only)

Nothing is deployed yet, and no agent deploys it. Before any deploy exists, the owner:

1. Creates the Vercel project with **root directory `apps/web`** (framework Next.js; install and
   build run from the repository root through npm workspaces).
2. Turns **Deployment Protection on** (Vercel Authentication for every deployment, production
   included) before the first deploy, data-bearing or not.
3. Leaves `WATCHMAN_SNAPSHOT_DIR` unset there: it is a local-only variable for the owner's
   machine, and a deploy without it serves only the labelled synthetic fixture.
4. Later, supplies real data server-side only: a new source adapter in `packages/core` that reads
   from a protected store or API with a token held in the project's server environment (never a
   `NEXT_PUBLIC_` variable), read by `src/server/` like the file adapter today. Each token's use
   is approved by the owner.

Locally, real data needs no deploy: build and start with the same variable,
`WATCHMAN_SNAPSHOT_DIR=/path/outside/the/repo npm run build` then
`WATCHMAN_SNAPSHOT_DIR=/path/outside/the/repo npm run start --workspace @watchman/web`. Both
`dev` and `start` listen on `127.0.0.1` only, because the dashboard has no login of its own: do
not widen that with `-H 0.0.0.0` while real data is loaded. The prerendered pages then hold real
figures in `apps/web/.next/`, which is git-ignored and never committed — and **never deploy a
build made with the variable set** (for example with `vercel deploy --prebuilt`): it would ship
those figures. Deploys build from source, without the variable.

## The MCP server

`packages/mcp` lets agents read the dashboard's four views through the
[Model Context Protocol](https://modelcontextprotocol.io), built on the official TypeScript SDK
(v2: `@modelcontextprotocol/server`). It has exactly four tools, `get_attention`, `get_flow`,
`get_spend` and `get_metrics`, all annotated read-only, and no resources, prompts or write tools; a
test fails if any other tool is registered. Each tool takes an optional `project` and an optional
time bound (`since` as ISO 8601 and/or `window` such as `7d`), validated, and answers compact JSON
whose top level carries `source` and `as_of`. A section nobody reported is an explicit `no_data`
record with its reason, and a typed-in figure carries `"manual": true`.

It reads what the web app reads, through the same `packages/core` reader: the newest usable
`snapshot-<ISO>.json` in `WATCHMAN_SNAPSHOT_DIR`, or, with the variable unset, the committed
synthetic fixture, and then every response says `"synthetic": true`. It makes no network call and
holds no token. It speaks stdio only: there is no HTTP transport, and the entry refuses to start on
any other `WATCHMAN_MCP_TRANSPORT`.

```bash
npm run --silent mcp                         # the server on stdin/stdout (--silent keeps npm's banner off stdout)
npm run contract --workspace @watchman/mcp   # regenerate CONTRACT.md after changing a tool
```

[`packages/mcp/CONTRACT.md`](packages/mcp/CONTRACT.md) documents each tool's input and output
schema with an example call and a synthetic example response, how the filters narrow each view, and
how to register the server in an MCP client. Its schemas and examples are generated from the running
server, and a test fails while they differ.

## The mobile app

`apps/mobile` is an Expo app (SDK 58, TypeScript, Expo Router with the one route directory
`src/app/`) that shows the **Attention tile** on a phone: the items that need the owner's yes,
ranked by value and urgency, top five, each one tap from where it is acted on. Like every other
surface it is read-only: the only action is opening an item's link.

It shows, from the committed **synthetic** fixture (`packages/core/fixtures/synthetic/full.json`):

- the headline count of everything waiting, and the five most urgent items below it, numbered;
- on every item its title, why it waits (needs a decision, blocked, or a pull request over two days
  old), its project, how long it has waited, its **source and as-of time**, and the host its link
  opens; tapping a row calls `Linking.openURL` with the item's deep link (a link that cannot be
  opened shows "Could not open that link", never a silent failure);
- a **synthetic** badge on the tile (and a **manual** one when a person typed the figures in), and
  one footer line stamping the tile with every source behind everything waiting and the oldest as-of;
- a labelled **"No data"** state, in neutral grey with the reason, when the Attention section has no
  data or the snapshot fails core's validation. It never shows a zero or an invented item.

The look matches the web theme in plain React Native styles: a dark canvas, a flat cobalt tile,
square corners, a big light figure and a pivot-style header. Each row is a link with a
whole-sentence accessibility label (title, why it waits, project, wait, source and as-of) and a
hint naming the host it opens, a 48dp touch target and a visible focus outline for keyboards; the
tile and its list carry `region` and `list` roles, which Android may use and iOS ignores, so
nothing depends on them. Body text follows the system text size (the big figures are capped at
1.2x), and the content keeps a 640dp column on tablets. White on cobalt is 6.2:1; a test keeps every
text colour at WCAG AA. It was run in the iOS simulator through Expo Go (screenshot in
[`docs/evidence/p3-mobile`](docs/evidence/p3-mobile/README.md)); not yet checked: Android,
VoiceOver and TalkBack traversal, the largest text sizes at 320dp, and the focus outline on an Android
hardware keyboard.

Ranking, validation and provenance are not reimplemented: the app imports `parseSnapshot`,
`rankAttention` and `combineProvenance` from `@watchman/core` through the npm workspace, and
`src/lib/attention-view.ts` only turns their output into the words the screen prints (the
view-model, unit-tested). The words shared with the web dashboard (why an item waits, how long, which
host a link opens) come from `@watchman/ui`, one implementation for both apps. Expo's Metro config resolves workspace packages on its own, so there is no
`metro.config.js`. The fixture is bundled, so the app makes no network request and holds no token;
real snapshots stay server-side, as in the safeguards below.

Run it locally (npm only; no EAS, no cloud build, no account):

```bash
npm ci
npm run start:mobile        # Expo dev server; scan the QR code with Expo Go, or press i / a
npx expo run:ios            # from apps/mobile: a local native build on the iOS simulator (needs Xcode)
npx expo run:android        # from apps/mobile: a local native build on an Android emulator (needs Android Studio)
npm run build --workspace @watchman/mobile   # bundle for iOS and Android headless: the build proof
npx expo-doctor             # from apps/mobile: dependency and config diagnosis
```

Expo Go needs no native build; open the Expo Go app on a phone on the same network and scan the
QR code the dev server prints, or press `i` / `a` in that terminal to open a simulator you have
installed. `ios/` and `android/` are generated on demand and git-ignored. The first `expo run:ios` or
`run:android` generates them and asks for an iOS bundle identifier or an Android package name, which
this repository deliberately does not declare (they identify the owner's app); answer the prompt, or
set `ios.bundleIdentifier` and `android.package` in `apps/mobile/app.json` locally, without committing
them.

## Getting started

Requires Node 24 (see `.nvmrc`) and npm 11.

```bash
npm ci              # install every workspace from the root lockfile
npm run lint        # ESLint + Prettier check
npm run typecheck   # tsc on the root config, then every workspace (Next route types first)
npm test            # Vitest across packages/*, apps/web, apps/mobile and artifacts
npm run build       # production build of apps/web, and an Expo export of apps/mobile
```

CI runs the same commands on every pull request and on pushes to `main`. The web build needs
network access: the layout self-hosts Open Sans (the Segoe-like fallback) through
`next/font/google` at build time. The mobile build is `expo export` for iOS and Android: it bundles
the app headless (no simulator, Xcode, Android Studio or account needed) and writes `apps/mobile/dist/`,
which is git-ignored.

### Each workspace

```bash
npm run dev:web                              # apps/web on http://localhost:3000 (/theme previews the theme)
npm run e2e --workspace @watchman/web        # Playwright on the production build (after npm run build)
npm run start:mobile                         # apps/mobile: Expo dev server (Expo Go or a simulator)
npm test --workspace @watchman/core          # one package's tests
npm test --workspace @watchman/mcp
npx prettier --write .                       # or: npm run format
```

Mobile builds are local only (`npx expo run:ios` / `run:android`); no cloud build service is used.

## Public-repo safeguards

This repository is public. The rules below apply to every change:

- **Synthetic fixtures only.** Nothing committed contains real usage or spend figures, quota
  readings, personal data, account identifiers, tokens or screenshots of real data. Every fixture is
  labelled synthetic (`packages/core/fixtures/synthetic/*.json` carrying `"synthetic": true`).
- **Real data only at runtime, server-side.** Real snapshots are read at runtime on the server, from
  the directory named by the `WATCHMAN_SNAPSHOT_DIR` environment variable, which points outside the
  repository. The location is configuration, never hard-coded, and never reaches client code. Local
  snapshot paths (`watchman-data/`, `.watchman-private/`, `snapshot-*.json`) are git-ignored.
- **Tokens stay server-side.** Credentials are supplied through the server environment only and are
  never committed, logged or shipped to a browser bundle. `.env*` files are git-ignored.
- **The MCP server is never exposed unauthenticated.** It is read-only, with no write tools, and
  speaks stdio only. Before it serves, its entry passes the transport through the guard in
  `packages/mcp/src/bind.ts`, which any future HTTP transport must also pass: loopback-bound, a
  server-side bearer token and loopback-only origins, or the server refuses to start.
- **The deployed web app sits behind access protection** before any deploy exists (see
  [Deploying](#deploying-owner-only)).
- **Every pull request is scanned for secrets and PII before it opens.** The author runs the scan on
  the diff (for example `gitleaks` and `secretlint`, plus a grep for token shapes and real figures)
  and records the result in the pull request body. CI does not run this scan yet.

## Licence

[MIT](LICENSE).
