import { readdir, readFile } from 'node:fs/promises';
import {
  resolveSnapshotSource,
  type ResolvedSnapshot,
  type SnapshotDirReader,
} from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json' with { type: 'json' };

/**
 * Where the server's data comes from: the same snapshot the web app reads, by the same rule —
 * core's `resolveSnapshotSource` — with Node's file system injected, and nothing else: no network
 * call, no token.
 *
 * - `WATCHMAN_SNAPSHOT_DIR` unset: the committed synthetic fixture, and every response says so.
 * - Set: the newest usable `snapshot-<ISO>.json` there (else a hand-placed `snapshot.json`).
 *   Never the fixture: a directory that cannot be read turns every section into `no_data` with a
 *   path-free reason.
 *
 * The directory never appears in a response: sources are file names, problems carry a code at most.
 */

export type LoadedSnapshot = ResolvedSnapshot;

export const FIXTURE_SOURCE = 'synthetic fixture full.json';

const nodeReader: SnapshotDirReader = {
  list: (dir) => readdir(dir),
  readText: (path) => readFile(path, 'utf8'),
};

/** Resolves and reads the snapshot for `env` at `now`. Never throws on a missing or bad file. */
export function loadSnapshot(
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  reader: SnapshotDirReader = nodeReader,
): Promise<LoadedSnapshot> {
  return resolveSnapshotSource(env, now, { reader, fixture, fixtureSource: FIXTURE_SOURCE });
}
