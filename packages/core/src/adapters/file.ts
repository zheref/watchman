import { SnapshotValidationError, parseSnapshot, type Snapshot } from '../snapshot';
import type { PartialSnapshot, SourceAdapter } from './source';

/**
 * Reading snapshots from a directory the operator configures. {@link readLatestSnapshot} is how a
 * real snapshot reaches a reader (the web app, later the MCP server): the newest
 * `snapshot-<ISO>.json` that parses. The `file` source adapter reads one named file and reports it
 * as a source, for {@link collectSnapshot}-style composition and tests.
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

/** Lists a directory's file names and reads a UTF-8 file: Node's `readdir`/`readFile` on a server. */
export interface SnapshotDirReader {
  list: (dir: string) => Promise<string[]>;
  readText: (path: string) => Promise<string>;
}

/** A snapshot file that was found but not used, and why (no path in either field). */
export interface SkippedSnapshot {
  source: string;
  problem: string;
}

export type LatestSnapshotResult =
  | { ok: true; snapshot: Snapshot; source: string; skipped: SkippedSnapshot[] }
  | { ok: false; problem: string; skipped: SkippedSnapshot[] };

/** How many of the newest snapshot files {@link readLatestSnapshot} tries before giving up. */
export const SNAPSHOT_READ_ATTEMPTS = 3;

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Why a snapshot file could not be used, with no path and no fragment of the file: a read error
 * keeps its code only, a JSON error says so, and a validation error names how many problems there
 * were and at which paths (a message could quote a value from the file, so none is kept).
 */
export function describeSnapshotProblem(error: unknown, source: string): string {
  if (error instanceof SnapshotValidationError) {
    const paths = [...new Set(error.issues.map((i) => i.path || '(root)'))].slice(0, 5);
    const n = error.issues.length;
    return `${source}: not a valid snapshot (${n} problem${n === 1 ? '' : 's'} at ${paths.join(', ')}${error.issues.length > paths.length ? ', …' : ''})`;
  }
  if (error instanceof SnapshotSourceError) return error.message;
  return `${source}: could not be parsed`;
}

/**
 * Reads the newest usable snapshot in `dir`: the `snapshot-<ISO>.json` files newest first (at most
 * {@link SNAPSHOT_READ_ATTEMPTS}, so one truncated or half-written file does not blank the
 * dashboard), else a hand-placed `snapshot.json`. Every file passed over is listed in `skipped`.
 * Never throws, and no message carries `dir`.
 */
export async function readLatestSnapshot(
  dir: string,
  reader: SnapshotDirReader,
): Promise<LatestSnapshotResult> {
  let names: string[];
  try {
    names = await reader.list(dir);
  } catch (error) {
    const code = errorCode(error);
    return {
      ok: false,
      problem: `the snapshot directory could not be listed${code ? ` (${code})` : ''}`,
      skipped: [],
    };
  }
  const candidates = names
    .filter((n) => SNAPSHOT_FILE_PATTERN.test(n))
    .sort()
    .reverse()
    .slice(0, SNAPSHOT_READ_ATTEMPTS);
  if (names.includes(DEFAULT_SNAPSHOT_FILE)) candidates.push(DEFAULT_SNAPSHOT_FILE);
  if (candidates.length === 0) {
    return {
      ok: false,
      problem: `no snapshot-*.json or ${DEFAULT_SNAPSHOT_FILE} in the snapshot directory yet`,
      skipped: [],
    };
  }
  const base = dir.trim().replace(/[\\/]+$/, '');
  const skipped: SkippedSnapshot[] = [];
  for (const name of candidates) {
    const source = `file:${name}`;
    try {
      const text = await reader.readText(`${base}/${name}`);
      return { ok: true, snapshot: parseSnapshotText(text, source), source, skipped };
    } catch (error) {
      const code = errorCode(error);
      skipped.push({
        source,
        problem:
          error instanceof SnapshotSourceError || error instanceof SnapshotValidationError
            ? describeSnapshotProblem(error, source)
            : `${source}: could not be read${code ? ` (${code})` : ''}`,
      });
    }
  }
  return { ok: false, problem: skipped[0]!.problem, skipped };
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
