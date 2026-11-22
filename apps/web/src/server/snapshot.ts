import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import {
  SNAPSHOT_SCHEMA_VERSION,
  assertSnapshot,
  noData,
  readLatestSnapshot,
  resolveSnapshotDir,
  type SnapshotDirReader,
  type Snapshot,
} from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json';
import type { DashboardData } from '@/lib/dashboard-data';

/**
 * Where the dashboard's data comes from, resolved on the server only. `WATCHMAN_SNAPSHOT_DIR` is
 * read here and nowhere else; `server-only` makes any client import of this module a build
 * error. The reading itself is `packages/core`'s `readLatestSnapshot`, which names files, never
 * the directory.
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

/** Every section `no_data` with `reason`, stamped `now`: what an unreadable source shows. */
export function unavailableSnapshot(reason: string, now: Date): Snapshot {
  const at = now.toISOString();
  const missing = noData(reason, 'watchman', at);
  return assertSnapshot({
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: at,
    attention: missing,
    flow: missing,
    spend: missing,
    metrics: missing,
  });
}

/** Resolves and reads the snapshot for `env` at `now`. Never throws. */
export async function readDashboardData(
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  reader: SnapshotDirReader = nodeReader,
): Promise<DashboardData> {
  const read_at = now.toISOString();
  const dir = resolveSnapshotDir(env);
  if (dir === null) {
    return {
      snapshot: assertSnapshot(fixture, FIXTURE_SOURCE),
      origin: 'synthetic-fixture',
      source: FIXTURE_SOURCE,
      skipped: [],
      read_at,
    };
  }
  const result = await readLatestSnapshot(dir, reader);
  if (result.ok) {
    return {
      snapshot: result.snapshot,
      origin: 'file',
      source: result.source,
      skipped: result.skipped,
      read_at,
    };
  }
  return {
    snapshot: unavailableSnapshot(result.problem, now),
    origin: 'unavailable',
    source: 'snapshot directory',
    problem: result.problem,
    skipped: result.skipped,
    read_at,
  };
}
