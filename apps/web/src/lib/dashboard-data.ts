import type { SkippedSnapshot, Snapshot } from '@watchman/core';

/** Where the dashboard's data came from. */
export type DataOrigin = 'file' | 'synthetic-fixture' | 'unavailable';

/**
 * What the server hands every dashboard view: the snapshot and how it was obtained. Nothing in it
 * names the snapshot directory — a source is a file name, a problem carries a code at most.
 */
export interface DashboardData {
  snapshot: Snapshot;
  origin: DataOrigin;
  /** `file:snapshot-….json` or `synthetic fixture full.json`: never a path. */
  source: string;
  /** Why the configured snapshot could not be shown, when `origin` is `unavailable`. */
  problem?: string;
  /** Newer snapshot files passed over because they could not be used. */
  skipped: SkippedSnapshot[];
  /** When this server last read the snapshot (ISO 8601). */
  read_at: string;
}
