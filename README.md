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

| Version | What it is                                                                     |
| ------- | ------------------------------------------------------------------------------ |
| v0      | a Claude artifact rendering the four tiles from a local snapshot               |
| v1      | the Next.js web app in `apps/web`                                              |
| v1      | a read-only MCP server in `packages/mcp`, so agents can read the same views    |
| later   | an Expo app in `apps/mobile` (scaffold only today) that reuses `packages/core` |

The workspace, tooling and CI are in place, along with the Metro theme, the shared domain model
and the synthetic fixtures. The real home view, its drill-downs and the MCP server land in later
pull requests.

## Layout

This is one npm-workspaces monorepo (npm only: no pnpm, yarn or bun, and one root
`package-lock.json`).

| Path            | Package            | What it is                                                                                                                                       |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`      | `@watchman/web`    | Next.js (App Router, TypeScript) with the Chakra UI v3 Metro theme and its tile, pivot-header and page-shell primitives; `/theme` previews them. |
| `apps/mobile`   | `@watchman/mobile` | Expo (TypeScript). Scaffold only; it will show the Attention tile.                                                                               |
| `packages/core` | `@watchman/core`   | The versioned `Snapshot` model and its validation, the Attention ranking and Flow/Spend/Metrics helpers, source adapters and synthetic fixtures. |
| `packages/mcp`  | `@watchman/mcp`    | The read-only MCP server. Today: no server and no SDK, only the transport guard that keeps it on stdio or a loopback address, and its tests.     |

Shared tooling lives at the root: `tsconfig.base.json` (every workspace extends it), one
`eslint.config.mjs` (typescript-eslint everywhere, plus Next's rules for `apps/web`), one Prettier
config, and a Vitest config that runs every `packages/*` project and `apps/web`. `apps/mobile` has
no test lane yet; it gets one with its first non-starter code (tracked in #6).

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
- Week and month boundaries are UTC unless the caller passes the owner's `utcOffsetMinutes`.
- The only adapter today reads a snapshot file from the directory in `WATCHMAN_SNAPSHOT_DIR`
  (server-side only, no default; see `apps/web/src/server/snapshot.ts`). Unset means "no data".
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

## Getting started

Requires Node 24 (see `.nvmrc`) and npm 11.

```bash
npm ci              # install every workspace from the root lockfile
npm run lint        # ESLint + Prettier check
npm run typecheck   # tsc on the root config, then every workspace (Next route types first)
npm test            # Vitest across packages/* and apps/web
npm run build       # production build of apps/web
```

CI runs the same commands on every pull request and on pushes to `main`. The web build needs
network access: the layout self-hosts Open Sans (the Segoe-like fallback) through
`next/font/google` at build time.

### Each workspace

```bash
npm run dev:web                              # apps/web on http://localhost:3000 (/theme previews the theme)
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
- **The MCP server is never exposed unauthenticated.** It will be read-only, with no write tools,
  and bind to stdio or a loopback address by default. The server itself lands in a later pull
  request; today `packages/mcp` holds only the transport guard it must call: stdio by default,
  and HTTP refused unless it is loopback-bound, requires a server-side bearer token and allows only
  loopback origins.
- **The deployed web app sits behind access protection** before any data-bearing deploy exists.
- **Every pull request is scanned for secrets and PII before it opens.** The author runs the scan on
  the diff (for example `gitleaks` and `secretlint`, plus a grep for token shapes and real figures)
  and records the result in the pull request body. CI does not run this scan yet.

## Licence

[MIT](LICENSE).
