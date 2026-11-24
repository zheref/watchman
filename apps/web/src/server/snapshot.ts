import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import { resolveSnapshotSource, type SnapshotDirReader } from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json';
import type { DashboardData } from '@/lib/dashboard-data';

/**
 * Where the dashboard's data comes from, resolved on the server only. `WATCHMAN_SNAPSHOT_DIR` is
 * read here and nowhere else; `server-only` makes any client import of this module a build
 * error. The rule is `packages/core`'s `resolveSnapshotSource` — the same one the MCP server
 * reads through — with Node's file system and the committed fixture injected; this module adds
 * only the time of the read.
 *
 * - Variable unset: the committed synthetic fixture (`full.json`), labelled synthetic.
 * - Variable set: the newest usable `snapshot-<ISO>.json` there (what `npm run snapshot` writes),
 *   else a hand-placed `snapshot.json`. Never the fixture: a configured directory that cannot be
 *   read shows every tile as "no data" with the reason, not invented figures.
 */

export type { DashboardData, DataOrigin } from '@/lib/dashboard-data';

const nodeReader: SnapshotDirReader = {
  list: (dir) => readdir(dir),
  readText: (path) => readFile(path, 'utf8'),
};

export const FIXTURE_SOURCE = 'synthetic fixture full.json';

/** Resolves and reads the snapshot for `env` at `now`. Never throws on a missing or bad file. */
export async function readDashboardData(
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  reader: SnapshotDirReader = nodeReader,
): Promise<DashboardData> {
  const resolved = await resolveSnapshotSource(env, now, {
    reader,
    fixture,
    fixtureSource: FIXTURE_SOURCE,
  });
  return { ...resolved, read_at: now.toISOString() };
}
