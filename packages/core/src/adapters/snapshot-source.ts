import { noData } from '../provenance';
import { SNAPSHOT_SCHEMA_VERSION, assertSnapshot, type Snapshot } from '../snapshot';
import {
  readLatestSnapshot,
  resolveSnapshotDir,
  type SkippedSnapshot,
  type SnapshotDirReader,
} from './file';

/**
 * Where a reader's snapshot comes from — the one rule every server-side reader follows (the web
 * app's loader, the MCP server):
 *
 * - `WATCHMAN_SNAPSHOT_DIR` unset: the committed synthetic fixture the caller passes, labelled so.
 * - Set: the newest usable `snapshot-<ISO>.json` there, else a hand-placed `snapshot.json`
 *   ({@link readLatestSnapshot}). **Never the fixture**: a configured directory that cannot be read
 *   is every section `no_data` with a path-free reason, not invented figures.
 *
 * Pure apart from the injected reader, so core stays free of platform APIs; the fixture is passed
 * in rather than imported, so no bundle that imports core carries it by accident.
 */

/** How the snapshot was obtained. */
export type SnapshotOrigin = 'file' | 'synthetic-fixture' | 'unavailable';

/** The label an unreadable configured directory carries: never its path. */
export const UNAVAILABLE_SNAPSHOT_SOURCE = 'snapshot directory';

export interface ResolvedSnapshot {
  snapshot: Snapshot;
  origin: SnapshotOrigin;
  /** `file:snapshot-….json`, the fixture's label or {@link UNAVAILABLE_SNAPSHOT_SOURCE}. */
  source: string;
  /** Why the configured snapshot could not be used, when `origin` is `unavailable`. */
  problem?: string;
  /** Newer snapshot files passed over because they could not be used. */
  skipped: SkippedSnapshot[];
}

export interface SnapshotSourceOptions {
  reader: SnapshotDirReader;
  /** The decoded synthetic fixture served when no directory is configured. */
  fixture: unknown;
  /** Its label, e.g. `synthetic fixture full.json`. */
  fixtureSource: string;
}

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

/** Resolves and reads the snapshot for `env` at `now`. Never throws on a missing or bad file. */
export async function resolveSnapshotSource(
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  options: SnapshotSourceOptions,
): Promise<ResolvedSnapshot> {
  const dir = resolveSnapshotDir(env);
  if (dir === null) {
    return {
      snapshot: assertSnapshot(options.fixture, options.fixtureSource),
      origin: 'synthetic-fixture',
      source: options.fixtureSource,
      skipped: [],
    };
  }
  const result = await readLatestSnapshot(dir, options.reader);
  if (result.ok) {
    return {
      snapshot: result.snapshot,
      origin: 'file',
      source: result.source,
      skipped: result.skipped,
    };
  }
  return {
    snapshot: unavailableSnapshot(result.problem, now),
    origin: 'unavailable',
    source: UNAVAILABLE_SNAPSHOT_SOURCE,
    problem: result.problem,
    skipped: result.skipped,
  };
}
