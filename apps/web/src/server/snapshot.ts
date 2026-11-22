import 'server-only';

import { readFile } from 'node:fs/promises';
import { createFileSnapshotAdapter, resolveSnapshotDir, type SourceAdapter } from '@watchman/core';

/**
 * The file source adapter, wired to this server's environment. `WATCHMAN_SNAPSHOT_DIR` is read
 * here and nowhere else: `server-only` makes any client import of this module a build error, so
 * neither the directory nor the data it holds can reach a browser bundle. Unset means no file
 * source (the caller shows "no data"); there is no default directory.
 */
export function snapshotFileAdapter(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SourceAdapter | null {
  const dir = resolveSnapshotDir(env);
  if (dir === null) return null;
  return createFileSnapshotAdapter({ dir, readText: (path) => readFile(path, 'utf8') });
}
