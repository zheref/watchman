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

This repository is at the **bootstrap** stage: the workspace, tooling and CI are in place, and the
apps and packages are deliberately minimal stubs. Theme, domain types, fixtures, tiles and the MCP
server land in later pull requests.

## Layout

This is one npm-workspaces monorepo (npm only: no pnpm, yarn or bun, and one root
`package-lock.json`).

| Path            | Package            | What it is                                                                                                                                   |
| --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`      | `@watchman/web`    | Next.js (App Router, TypeScript). Today the clean `create-next-app` starter; it becomes the v1 dashboard.                                    |
| `apps/mobile`   | `@watchman/mobile` | Expo (TypeScript). Scaffold only; it will show the Attention tile.                                                                           |
| `packages/core` | `@watchman/core`   | Shared data adapters, types and the scoring/ranking logic. Today: a stable `topN` ranking primitive and its tests.                           |
| `packages/mcp`  | `@watchman/mcp`    | The read-only MCP server. Today: no server and no SDK, only the transport guard that keeps it on stdio or a loopback address, and its tests. |

Shared tooling lives at the root: `tsconfig.base.json` (every workspace extends it), one
`eslint.config.mjs` (typescript-eslint everywhere, plus Next's rules for `apps/web`), one Prettier
config, and a Vitest config that runs every `packages/*` project. The two apps have no test lane
yet; each gets one with its first non-starter code (tracked in #4 and #6).

The stack handbook this repository resolves is `react-uzf-v1`. Its monorepo topology (RC-49 to
RC-51) differs from this layout (an MCP package, npm workspaces, no Redux or shared-UI tier); the
ruling on that difference is tracked in #8.

## Getting started

Requires Node 24 (see `.nvmrc`) and npm 11.

```bash
npm ci              # install every workspace from the root lockfile
npm run lint        # ESLint + Prettier check
npm run typecheck   # tsc on the root config, then every workspace (Next route types first)
npm test            # Vitest across packages/*
npm run build       # production build of apps/web
```

CI runs the same commands on every pull request and on pushes to `main`. The web build needs
network access: the starter layout loads its fonts through `next/font/google` at build time.

### Each workspace

```bash
npm run dev:web                              # apps/web on http://localhost:3000
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
  labelled synthetic (for example `fixtures/synthetic/*.json` carrying `"synthetic": true`).
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
