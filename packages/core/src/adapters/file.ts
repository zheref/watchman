import { SnapshotValidationError, parseSnapshot } from '../snapshot';
import type { PartialSnapshot, SourceAdapter } from './source';

/**
 * The file adapter: reads a whole snapshot JSON from a directory the operator configures. It is
 * how committed synthetic fixtures and locally produced real snapshots (kept outside the
 * repository) both reach the app.
 *
 * Core stays free of platform APIs, so the caller injects the file reader (Node's `readFile` on
 * the server). The directory comes from {@link SNAPSHOT_DIR_ENV}; there is no default path, and
 * the directory never appears in a source label or an error message, so it cannot leak into a
 * rendered page.
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
      } catch (cause) {
        throw new SnapshotSourceError(`${source}: could not be read`, { cause });
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (cause) {
        throw new SnapshotSourceError(`${source}: not valid JSON`, { cause });
      }
      const result = parseSnapshot(json);
      if (!result.ok) throw new SnapshotValidationError(result.issues, source);
      const { snapshot } = result;
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
