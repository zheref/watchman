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

/**
 * The only commands allowed, each with the only flags it may carry (`true`: the flag takes a
 * value, given as `--flag value` or `--flag=value`; `false`: a switch) and how many positional
 * arguments it takes. Anything else — another command, flag, attached short flag (`-fbody=x`),
 * or a positional that looks like a flag — is refused. `gh api` has no body, method, header or
 * input flag here, so it can only GET; GraphQL is refused by path, since it is a POST and a
 * mutation would look like any other query.
 */
const ALLOWED: Record<string, { flags: Record<string, boolean>; positionals: [number, number] }> = {
  api: {
    flags: { '--paginate': false, '--jq': true, '-q': true, '--hostname': true },
    positionals: [1, 1],
  },
  'repo list': {
    flags: {
      '--limit': true,
      '-L': true,
      '--json': true,
      '--source': false,
      '--no-archived': false,
    },
    positionals: [0, 1],
  },
  'pr list': {
    flags: {
      '--repo': true,
      '-R': true,
      '--state': true,
      '-s': true,
      '--limit': true,
      '-L': true,
      '--search': true,
      '-S': true,
      '--json': true,
    },
    positionals: [0, 0],
  },
  'issue list': {
    flags: {
      '--repo': true,
      '-R': true,
      '--state': true,
      '-s': true,
      '--limit': true,
      '-L': true,
      '--search': true,
      '-S': true,
      '--json': true,
    },
    positionals: [0, 0],
  },
};

/** Refuses any `gh` invocation that is not one of the plain reads in {@link ALLOWED}. */
export function assertReadOnlyGh(args: readonly string[]): void {
  const [command, sub] = args;
  if (command === undefined) throw new GhWriteRefusedError('refused: empty gh command');
  const key = command === 'api' ? 'api' : `${command} ${sub ?? ''}`;
  const rule = ALLOWED[key];
  if (rule === undefined) {
    throw new GhWriteRefusedError(`refused: gh ${key.trim()} is not a read-only command`);
  }
  const rest = args.slice(command === 'api' ? 1 : 2);
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq > 0 && arg.startsWith('--') ? arg.slice(0, eq) : arg;
    const takesValue = rule.flags[name];
    if (takesValue === undefined) {
      throw new GhWriteRefusedError(`refused: gh flag ${name} is not allowed on gh ${key.trim()}`);
    }
    if (takesValue && name === arg) {
      if (i + 1 >= rest.length) throw new GhWriteRefusedError(`refused: ${name} needs a value`);
      i += 1;
    } else if (!takesValue && name !== arg) {
      throw new GhWriteRefusedError(`refused: ${name} takes no value`);
    }
  }
  const [min, max] = rule.positionals;
  if (positionals.length < min || positionals.length > max) {
    throw new GhWriteRefusedError(`refused: gh ${key.trim()} takes ${min}–${max} plain arguments`);
  }
  if (command === 'api') {
    const path = positionals[0]!;
    if (/^\/?graphql\b/i.test(path))
      throw new GhWriteRefusedError('refused: gh api graphql is a POST');
    if (!/^[A-Za-z0-9_./-]+(?:\?[A-Za-z0-9_.=&%-]*)?$/.test(path) || path.includes('..')) {
      throw new GhWriteRefusedError('refused: gh api path is not a plain REST path');
    }
  }
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
