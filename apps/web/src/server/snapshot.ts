import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import {
  DEFAULT_SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotSourceError,
  SnapshotValidationError,
  assertSnapshot,
  latestSnapshotFileName,
  noData,
  parseSnapshotText,
  resolveSnapshotDir,
  type Snapshot,
} from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json';

/**
 * Where the dashboard's data comes from, resolved on the server only. `WATCHMAN_SNAPSHOT_DIR` is
 * read here and nowhere else; `server-only` makes any client import of this module a build
 * error, and nothing returned from here carries the directory: a source is named by its file
 * name alone, and an error by its code.
 *
 * - Variable unset: the committed synthetic fixture (`full.json`), labelled synthetic.
 * - Variable set: the newest `snapshot-<ISO>.json` in that directory (what `npm run snapshot`
 *   writes), else a hand-placed `snapshot.json`. Never the fixture: a configured directory
 *   that cannot be read shows every tile as "no data" with the reason, not invented figures.
 */

export type DataOrigin = 'file' | 'synthetic-fixture' | 'unavailable';

export interface DashboardData {
  snapshot: Snapshot;
  origin: DataOrigin;
  /** `file:snapshot-….json` or `synthetic fixture full.json`: never a path. */
  source: string;
  /** Why the configured snapshot could not be shown, when `origin` is `unavailable`. */
  problem?: string;
  /** When this server last read the snapshot (ISO 8601). */
  read_at: string;
}

export interface SnapshotFiles {
  list: (dir: string) => Promise<string[]>;
  readText: (path: string) => Promise<string>;
}

const nodeFiles: SnapshotFiles = {
  list: (dir) => readdir(dir),
  readText: (path) => readFile(path, 'utf8'),
};

export const FIXTURE_SOURCE = 'synthetic fixture full.json';

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

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
  files: SnapshotFiles = nodeFiles,
): Promise<DashboardData> {
  const read_at = now.toISOString();
  const dir = resolveSnapshotDir(env);
  if (dir === null) {
    return {
      snapshot: assertSnapshot(fixture, FIXTURE_SOURCE),
      origin: 'synthetic-fixture',
      source: FIXTURE_SOURCE,
      read_at,
    };
  }

  const unavailable = (problem: string, source = 'snapshot directory'): DashboardData => ({
    snapshot: unavailableSnapshot(problem, now),
    origin: 'unavailable',
    source,
    problem,
    read_at,
  });

  let names: string[];
  try {
    names = await files.list(dir);
  } catch (error) {
    const code = errorCode(error);
    return unavailable(`the snapshot directory could not be listed${code ? ` (${code})` : ''}`);
  }
  const name =
    latestSnapshotFileName(names) ??
    (names.includes(DEFAULT_SNAPSHOT_FILE) ? DEFAULT_SNAPSHOT_FILE : null);
  if (name === null) return unavailable('no snapshot-*.json in the snapshot directory yet');

  const source = `file:${name}`;
  let text: string;
  try {
    text = await files.readText(`${dir.replace(/[\\/]+$/, '')}/${name}`);
  } catch (error) {
    const code = errorCode(error);
    return unavailable(`${source}: could not be read${code ? ` (${code})` : ''}`, source);
  }
  try {
    return { snapshot: parseSnapshotText(text, source), origin: 'file', source, read_at };
  } catch (error) {
    if (error instanceof SnapshotSourceError || error instanceof SnapshotValidationError) {
      return unavailable(error.message.slice(0, 300), source);
    }
    return unavailable(`${source}: could not be parsed`, source);
  }
}
