import { SnapshotValidationError, parseSnapshot, type Snapshot } from '../snapshot';
import type { PartialSnapshot, SourceAdapter } from './source';

/**
 * The file adapter: reads a whole snapshot JSON from a directory the operator configures. It is
 * how committed synthetic fixtures and locally produced real snapshots (kept outside the
 * repository) both reach the app.
 *
 * Core stays free of platform APIs, so the caller injects the file reader (Node's `readFile` on
 * the server). The directory comes from {@link SNAPSHOT_DIR_ENV}; there is no default path, and
 * the directory never appears in a source label, an error message or an error's `cause` (only a
 * read error's `code` is kept), so neither the path nor a fragment of the file can leak into a
 * page or a log.
 */

/** The server-side environment variable naming the snapshot directory. */
export const SNAPSHOT_DIR_ENV = 'WATCHMAN_SNAPSHOT_DIR';

/** The file read from that directory unless the caller names another. */
export const DEFAULT_SNAPSHOT_FILE = 'snapshot.json';

/**
 * The configured snapshot directory, or `null` when it is unset or blank. Pass the server's
 * environment (`process.env`); there is deliberately no fallback location.
 */
export function resolveSnapshotDir(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const dir = env[SNAPSHOT_DIR_ENV]?.trim();
  return dir ? dir : null;
}

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

export interface FileSnapshotAdapterOptions {
  /** The directory, usually from {@link resolveSnapshotDir}. */
  dir: string;
  /** A bare `*.json` file name inside `dir`; no separators, no `..`. */
  fileName?: string;
  /** Reads a UTF-8 text file; Node's `(p) => readFile(p, 'utf8')` on the server. */
  readText: (path: string) => Promise<string>;
}

export class SnapshotSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotSourceError';
  }
}

/**
 * The name `npm run snapshot` writes: `snapshot-2026-11-22T19-07-28Z.json` (see
 * `snapshotFileName`). Its timestamp sorts lexically in time order.
 */
export const SNAPSHOT_FILE_PATTERN = /^snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/;

/**
 * The newest snapshot among a directory's file names: the latest `snapshot-<ISO>.json`, or
 * `null` when there is none. Any other name is ignored, so a stray or hand-named file is never
 * read by accident.
 */
export function latestSnapshotFileName(names: readonly string[]): string | null {
  let latest: string | null = null;
  for (const name of names) {
    if (SNAPSHOT_FILE_PATTERN.test(name) && (latest === null || name > latest)) latest = name;
  }
  return latest;
}

/**
 * Decodes and validates one snapshot file's text. `source` names the file in errors (never a
 * path); a JSON error keeps no cause, because a parser message quotes a fragment of the file.
 */
export function parseSnapshotText(text: string, source: string): Snapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SnapshotSourceError(`${source}: not valid JSON`);
  }
  const result = parseSnapshot(json);
  if (!result.ok) throw new SnapshotValidationError(result.issues, source);
  return result.snapshot;
}

/** Builds the `file` source adapter. */
export function createFileSnapshotAdapter(options: FileSnapshotAdapterOptions): SourceAdapter {
  const fileName = options.fileName ?? DEFAULT_SNAPSHOT_FILE;
  if (!SAFE_FILE_NAME.test(fileName) || fileName.includes('..')) {
    throw new RangeError(
      `snapshot file name must be a bare *.json name, got ${JSON.stringify(fileName)}`,
    );
  }
  const dir = options.dir.trim();
  if (dir === '') throw new RangeError('snapshot directory must not be empty');
  const path = `${dir.replace(/[\\/]+$/, '')}/${fileName}`;
  const source = `file:${fileName}`;

  return {
    id: 'file',
    async fetch(): Promise<PartialSnapshot> {
      let text: string;
      try {
        text = await options.readText(path);
      } catch (error) {
        // Keep only the error code: Node's message carries the absolute path.
        const code = (error as { code?: unknown } | null)?.code;
        throw new SnapshotSourceError(
          `${source}: could not be read${typeof code === 'string' ? ` (${code})` : ''}`,
          typeof code === 'string' ? { cause: { code } } : undefined,
        );
      }
      const snapshot = parseSnapshotText(text, source);
      return {
        source,
        as_of: snapshot.generated_at,
        ...(snapshot.synthetic === true ? { synthetic: true } : {}),
        sections: {
          attention: snapshot.attention,
          flow: snapshot.flow,
          spend: snapshot.spend,
          metrics: snapshot.metrics,
        },
      };
    },
  };
}
