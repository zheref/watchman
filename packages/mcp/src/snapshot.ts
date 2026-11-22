import { readdir, readFile } from 'node:fs/promises';
import {
  SNAPSHOT_SCHEMA_VERSION,
  assertSnapshot,
  noData,
  readLatestSnapshot,
  resolveSnapshotDir,
  type SkippedSnapshot,
  type Snapshot,
  type SnapshotDirReader,
} from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json' with { type: 'json' };

/**
 * Where the server's data comes from: the same snapshot the web app reads, through the same core
 * reader, and nothing else — no network call, no token.
 *
 * - `WATCHMAN_SNAPSHOT_DIR` unset: the committed synthetic fixture, and every response says so.
 * - Set: the newest usable `snapshot-<ISO>.json` there (else a hand-placed `snapshot.json`).
 *   Never the fixture: a directory that cannot be read turns every section into `no_data` with a
 *   path-free reason.
 *
 * The directory never appears in a response: sources are file names, problems carry a code at most.
 */

export type DataOrigin = 'file' | 'synthetic-fixture' | 'unavailable';

export interface LoadedSnapshot {
  snapshot: Snapshot;
  origin: DataOrigin;
  /** `file:snapshot-….json`, the fixture's label or `snapshot directory`: never a path. */
  file: string;
  skipped: SkippedSnapshot[];
}

export const FIXTURE_SOURCE = 'synthetic fixture full.json';

const nodeReader: SnapshotDirReader = {
  list: (dir) => readdir(dir),
  readText: (path) => readFile(path, 'utf8'),
};

/** Every section `no_data` with `reason`, stamped `now`: what an unreadable source answers. */
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
export async function loadSnapshot(
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  reader: SnapshotDirReader = nodeReader,
): Promise<LoadedSnapshot> {
  const dir = resolveSnapshotDir(env);
  if (dir === null) {
    return {
      snapshot: assertSnapshot(fixture, FIXTURE_SOURCE),
      origin: 'synthetic-fixture',
      file: FIXTURE_SOURCE,
      skipped: [],
    };
  }
  const result = await readLatestSnapshot(dir, reader);
  if (result.ok) {
    return {
      snapshot: result.snapshot,
      origin: 'file',
      file: result.source,
      skipped: result.skipped,
    };
  }
  return {
    snapshot: unavailableSnapshot(result.problem, now),
    origin: 'unavailable',
    file: 'snapshot directory',
    skipped: result.skipped,
  };
}
