/**
 * The GitHub CLI boundary. Core never spawns a process: the caller injects a {@link GhRunner}
 * (`execFile('gh', args)` on the owner's machine, a fake in tests), and every command goes through
 * {@link readOnlyGh} first, so nothing that could write to GitHub is ever run — whatever a caller
 * or a future edit asks for.
 */

/** Runs `gh <args>` and resolves with its standard output. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

export class GhWriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhWriteRefusedError';
  }
}

/** `gh` subcommands that only read. Anything else is refused. */
const READ_ONLY_LISTS = new Set(['pr list', 'issue list', 'repo list']);

/**
 * Flags that turn `gh api` into a write (`-X`/`--method`, or a request body: `-f`, `-F`,
 * `--field`, `--raw-field`, `--input`) or open a browser.
 */
const WRITE_FLAG = /^(?:-X|--method|-f|-F|--field|--raw-field|--input|--web|-w)(?:=.*)?$/;

/**
 * Refuses any `gh` invocation that is not a plain read: `gh api <REST path>` as a GET with no
 * body, or `gh pr list`, `gh issue list`, `gh repo list`. GraphQL is refused too: it is a POST,
 * and a mutation would look like any other query to this guard.
 */
export function assertReadOnlyGh(args: readonly string[]): void {
  const [command, sub] = args;
  if (command === undefined) throw new GhWriteRefusedError('refused: empty gh command');
  for (const arg of args) {
    if (WRITE_FLAG.test(arg) || /^-X./.test(arg)) {
      throw new GhWriteRefusedError(`refused: gh flag ${arg} can write or open a browser`);
    }
  }
  if (command === 'api') {
    const path = args.slice(1).find((a) => !a.startsWith('-'));
    if (path === undefined) throw new GhWriteRefusedError('refused: gh api without a path');
    if (/^\/?graphql\b/i.test(path)) {
      throw new GhWriteRefusedError('refused: gh api graphql is a POST');
    }
    return;
  }
  if (sub !== undefined && READ_ONLY_LISTS.has(`${command} ${sub}`)) return;
  throw new GhWriteRefusedError(`refused: gh ${command} ${sub ?? ''} is not a read-only command`);
}

/** Wraps a runner so that every call is checked by {@link assertReadOnlyGh} before it runs. */
export function readOnlyGh(run: GhRunner): GhRunner {
  return (args) => {
    try {
      assertReadOnlyGh(args);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return run(args);
  };
}

/** Runs a read-only `gh` command and decodes its JSON output. */
export async function ghJson(run: GhRunner, args: readonly string[]): Promise<unknown> {
  const out = await readOnlyGh(run)(args);
  try {
    return JSON.parse(out) as unknown;
  } catch {
    // No cause: a parser error quotes a fragment of the output.
    throw new Error(`gh ${args.slice(0, 2).join(' ')}: output is not JSON`);
  }
}
