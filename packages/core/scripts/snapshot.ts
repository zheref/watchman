/**
 * `npm run snapshot`: builds a real snapshot on the owner's machine and writes it as
 * `snapshot-<ISO>.json` into the snapshot directory — `--out <dir>`, else `WATCHMAN_SNAPSHOT_DIR`.
 * There is no default directory, and a directory inside this repository (any of its worktrees)
 * is refused, so real data never lands in the working tree.
 *
 * The run prints only the snapshot's shape (sections, counts, which sources had no data); the
 * figures stay in the file.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNAPSHOT_DIR_ENV,
  SnapshotSourceError,
  SnapshotValidationError,
  buildSnapshot,
  describeSnapshotShape,
  isInsidePath,
  resolveSnapshotDir,
  snapshotFileName,
  type GhRunner,
} from '../src/index';

export interface CliDeps {
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  now: () => Date;
  /** Every checkout of this repository: its root and each of its git worktrees. */
  repoRoots: () => Promise<string[]>;
  readText: (path: string) => Promise<string>;
  /** Writes a new file; must fail if it already exists. */
  writeNew: (path: string, text: string) => Promise<void>;
  ensureDir: (path: string) => Promise<void>;
  /** Resolves symlinks in the longest existing prefix of `path`. */
  canonical: (path: string) => Promise<string>;
  runGh: GhRunner;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `usage: npm run snapshot -- [--out <dir>] [--no-github]

Writes snapshot-<ISO>.json into <dir>, or into $${SNAPSHOT_DIR_ENV} when --out is absent.
The directory must be outside this repository.`;

export interface CliArgs {
  out?: string;
  github: boolean;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs | { error: string } {
  const args: CliArgs = { github: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--no-github') args.github = false;
    else if (arg === '--out') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        return { error: '--out needs a directory' };
      }
      args.out = value;
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
      if (args.out.trim() === '') return { error: '--out needs a directory' };
    } else return { error: `unknown argument: ${arg}` };
  }
  return args;
}

/** Runs the command; resolves with the process exit code. */
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv);
  if ('error' in args) {
    deps.err(`snapshot: ${args.error}\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    deps.out(USAGE);
    return 0;
  }
  const chosen = args.out?.trim() || resolveSnapshotDir(deps.env);
  if (!chosen) {
    deps.err(`snapshot: no output directory: pass --out <dir> or set ${SNAPSHOT_DIR_ENV}`);
    return 2;
  }
  const dir = await deps.canonical(
    isAbsolute(chosen) ? resolve(chosen) : resolve(deps.cwd, chosen),
  );
  let roots: string[];
  try {
    roots = await Promise.all((await deps.repoRoots()).map((root) => deps.canonical(root)));
  } catch {
    // Fail closed: without the list of checkouts, "outside the repository" cannot be proved.
    deps.err("snapshot: could not list this repository's checkouts, so nothing was written");
    return 3;
  }
  if (roots.some((root) => isInsidePath(dir, root))) {
    deps.err(
      'snapshot: refusing to write inside the repository: real data must stay outside it. ' +
        `Point --out or ${SNAPSHOT_DIR_ENV} at a directory outside every checkout.`,
    );
    return 3;
  }

  const now = deps.now();
  const file = snapshotFileName(now);
  let built: Awaited<ReturnType<typeof buildSnapshot>>;
  try {
    await deps.ensureDir(dir);
    built = await buildSnapshot({
      dir,
      readText: deps.readText,
      now,
      ...(args.github ? { runGh: deps.runGh } : {}),
    });
    await deps.writeNew(`${dir}/${file}`, `${JSON.stringify(built.snapshot, null, 2)}\n`);
  } catch (error) {
    deps.err(`snapshot: nothing was written: ${describeError(error)}`);
    return 1;
  }

  deps.out(`snapshot: wrote ${file} to the snapshot directory`);
  for (const line of describeSnapshotShape(built)) deps.out(`  ${line}`);
  for (const source of built.sources) {
    if (source.status !== 'value' && source.reason) {
      deps.out(
        `  ${source.adapter} ${source.status === 'failed' ? 'failed' : 'no data'}: ${source.reason}`,
      );
    }
  }
  // The file is written either way (its gaps are labelled), but a failed source is worth a
  // non-zero exit so a scheduled run notices.
  return built.failures.length > 0 ? 4 : 0;
}

/**
 * A failure in words that carry no path and no data: core's own errors are written that way;
 * anything else (Node's file errors name the absolute path) is reduced to its code.
 */
export function describeError(error: unknown): string {
  if (error instanceof SnapshotSourceError || error instanceof SnapshotValidationError) {
    return error.message;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? `a file operation failed (${code})` : 'an unexpected error';
}

// --- Node wiring ---------------------------------------------------------------------------------

export function run(file: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      file,
      [...args],
      {
        cwd,
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' },
      },
      (error, stdout) => {
        if (error) {
          // Only the command and its exit status: stderr can name private repositories or paths.
          const status = typeof error.code === 'number' ? ` (exit ${error.code})` : '';
          reject(new Error(`${file} ${args.slice(0, 2).join(' ')} failed${status}`));
        } else resolvePromise(String(stdout));
      },
    );
  });
}

export async function canonical(path: string): Promise<string> {
  let head = path;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await realpath(head);
      return tail.length === 0 ? real : resolve(real, ...tail.reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return path;
      tail.push(head.slice(parent.length).replace(/^[\\/]/, ''));
      head = parent;
    }
  }
}

export function nodeDeps(scriptDir: string): CliDeps {
  const repoRoot = resolve(scriptDir, '../../..');
  return {
    env: process.env,
    cwd: process.env.INIT_CWD ?? process.cwd(),
    now: () => new Date(),
    async repoRoots() {
      const listing = await run('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
      const worktrees = listing
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length));
      if (worktrees.length === 0) throw new Error('git listed no worktrees');
      return [repoRoot, ...worktrees];
    },
    readText: (path) => readFile(path, 'utf8'),
    writeNew: (path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }),
    ensureDir: async (path) => {
      await mkdir(path, { recursive: true, mode: 0o700 });
    },
    canonical,
    runGh: (args) => run('gh', args),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === self) {
  main(process.argv.slice(2), nodeDeps(dirname(self))).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`snapshot: ${describeError(error)}\n`);
      process.exitCode = 1;
    },
  );
}
