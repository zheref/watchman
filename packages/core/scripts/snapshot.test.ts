import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import spendSheet from '../fixtures/synthetic/exports/ai-surfaces-spend.json';
import { parseSnapshot } from '../src/index';
import { fakeGh } from '../src/test/fake-gh';
import { canonical, main, nodeDeps, parseArgs, run, type CliDeps } from './snapshot';

const NOW = new Date('2026-01-14T15:00:00.123Z');
const REPO = '/synthetic/checkouts/watchman';
const WORKTREE = '/synthetic/checkouts/watchman/.claude/worktrees/wm';

function deps(overrides: Partial<CliDeps> = {}) {
  const written = new Map<string, string>();
  const made: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const files: Record<string, string> = {
    '/synthetic/data/ai-surfaces-spend.json': JSON.stringify(spendSheet),
  };
  const gh = fakeGh({ viewer: 'sample-owner', accounts: { 'sample-owner': 'User' }, repos: [] });
  const d: CliDeps = {
    env: {},
    cwd: WORKTREE,
    now: () => NOW,
    repoRoots: () => Promise.resolve([WORKTREE, REPO]),
    readText: (path) =>
      files[path] === undefined
        ? Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }))
        : Promise.resolve(files[path]),
    writeNew: (path, text) => {
      if (written.has(path)) return Promise.reject(new Error('EEXIST'));
      written.set(path, text);
      return Promise.resolve();
    },
    ensureDir: (path) => {
      made.push(path);
      return Promise.resolve();
    },
    canonical: (path) => Promise.resolve(path.replace('/link-to-repo', REPO)),
    runGh: gh.run,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...overrides,
  };
  return { d, written, made, out, err, gh };
}

describe('npm run snapshot', () => {
  it('writes snapshot-<ISO>.json into WATCHMAN_SNAPSHOT_DIR and prints only the shape', async () => {
    const t = deps({ env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' } });
    expect(await main([], t.d)).toBe(0);
    expect([...t.written.keys()]).toEqual(['/synthetic/data/snapshot-2026-01-14T15-00-00Z.json']);
    const snapshot = JSON.parse([...t.written.values()][0]!) as unknown;
    expect(parseSnapshot(snapshot).ok).toBe(true);
    expect(t.made).toEqual(['/synthetic/data']);
    expect(t.out[0]).toBe(
      'snapshot: wrote snapshot-2026-01-14T15-00-00Z.json to the snapshot directory',
    );
    expect(t.out).toContain('  spend: value (3 providers)');
    expect(t.out).toContain(
      '  handoff-board no data: handoff-board.json is not in the snapshot directory',
    );
    expect(t.out.join('\n')).not.toMatch(/synthetic\/data|Sample Provider|80000/);
    expect(t.err).toEqual([]);
  });

  it('prefers --out over the environment and resolves it against the caller’s directory', async () => {
    const t = deps({ env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/ignored' }, cwd: '/synthetic' });
    expect(await main(['--out', 'data'], t.d)).toBe(0);
    expect([...t.written.keys()][0]).toMatch(/^\/synthetic\/data\/snapshot-/);
    const u = deps();
    expect(await main(['--out=/synthetic/data', '--no-github'], u.d)).toBe(0);
    expect(u.gh.calls).toEqual([]);
  });

  it.each([
    ['the repository root', REPO],
    ['a folder inside it', `${REPO}/data`],
    ['the worktree it runs from', `${WORKTREE}/snapshots`],
    ['a symlink into it', '/link-to-repo/data'],
  ])('refuses to write inside %s', async (_what, out) => {
    const t = deps();
    expect(await main(['--out', out], t.d)).toBe(3);
    expect(t.err[0]).toContain('refusing to write inside the repository');
    expect(t.written.size).toBe(0);
    expect(t.made).toEqual([]);
    expect(t.gh.calls).toEqual([]);
  });

  it('refuses to run without a directory, with a usage line', async () => {
    const t = deps({ env: { WATCHMAN_SNAPSHOT_DIR: '  ' } });
    expect(await main([], t.d)).toBe(2);
    expect(t.err[0]).toBe(
      'snapshot: no output directory: pass --out <dir> or set WATCHMAN_SNAPSHOT_DIR',
    );
    expect(t.written.size).toBe(0);
  });

  it('answers --help and refuses unknown arguments', async () => {
    const t = deps();
    expect(await main(['--help'], t.d)).toBe(0);
    expect(t.out[0]).toContain('usage: npm run snapshot');
    expect(await main(['--bogus'], t.d)).toBe(2);
    expect(t.err[0]).toContain('unknown argument: --bogus');
    expect(parseArgs(['--out'])).toEqual({ error: '--out needs a directory' });
    expect(parseArgs(['--out', '--no-github'])).toEqual({ error: '--out needs a directory' });
  });

  it('still writes the snapshot when a source fails, but exits 4 and names the failure', async () => {
    const t = deps({
      env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' },
      runGh: () => Promise.reject(new Error('gh is not signed in')),
    });
    expect(await main([], t.d)).toBe(4);
    expect(t.written.size).toBe(1);
    expect(t.out).toContain('  github failed: gh is not signed in');
  });

  it('never overwrites an existing snapshot, and names no path when a write fails', async () => {
    const t = deps({ env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' } });
    expect(await main([], t.d)).toBe(0);
    const u = deps({
      env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' },
      writeNew: (path) =>
        Promise.reject(
          Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), {
            code: 'EEXIST',
          }),
        ),
    });
    expect(await main([], u.d)).toBe(1);
    expect(u.err).toEqual(['snapshot: nothing was written: a file operation failed (EEXIST)']);
    const v = deps({
      env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' },
      readText: (path) =>
        path.endsWith('watchman.config.json')
          ? Promise.resolve('{')
          : Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' })),
    });
    expect(await main([], v.d)).toBe(1);
    expect(v.err).toEqual(['snapshot: nothing was written: watchman.config.json: not valid JSON']);
    const w = deps({
      env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' },
      ensureDir: () => Promise.reject(new Error('odd')),
    });
    expect(await main([], w.d)).toBe(1);
    expect(w.err).toEqual(['snapshot: nothing was written: an unexpected error']);
  });

  it('fails closed when the checkouts cannot be listed', async () => {
    const t = deps({
      env: { WATCHMAN_SNAPSHOT_DIR: '/synthetic/data' },
      repoRoots: () => Promise.reject(new Error('no git')),
    });
    expect(await main([], t.d)).toBe(3);
    expect(t.err[0]).toBe(
      "snapshot: could not list this repository's checkouts, so nothing was written",
    );
    expect(t.written.size).toBe(0);
    expect(t.made).toEqual([]);
  });

  it('refuses an empty --out instead of falling back to the environment', () => {
    expect(parseArgs(['--out', ' '])).toEqual({ error: '--out needs a directory' });
    expect(parseArgs(['--out='])).toEqual({ error: '--out needs a directory' });
  });
});

describe('the Node wiring', () => {
  const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));
  const ROOT = resolve(SCRIPTS, '../../..');
  let scratch = '';

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'watchman-cli-test-'));
  });
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('lists this checkout among the repository roots', async () => {
    const roots = await nodeDeps(SCRIPTS).repoRoots();
    expect(roots[0]).toBe(ROOT);
  });

  it('creates the directory and writes a new file only once, owner-readable', async () => {
    const node = nodeDeps(SCRIPTS);
    const dir = join(scratch, 'out');
    await node.ensureDir(dir);
    await node.writeNew(join(dir, 'a.json'), '{}');
    expect(await node.readText(join(dir, 'a.json'))).toBe('{}');
    await expect(node.writeNew(join(dir, 'a.json'), '{}')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(node.now()).toBeInstanceOf(Date);
  });

  it('resolves symlinks in the longest existing prefix of a path', async () => {
    const real = await canonical(scratch);
    await symlink(real, join(scratch, 'link'));
    expect(await canonical(join(scratch, 'link', 'not', 'yet'))).toBe(join(real, 'not', 'yet'));
    expect(await canonical('/')).toBe('/');
  });

  it('refuses a real directory inside this checkout', async () => {
    const err: string[] = [];
    const deps = { ...nodeDeps(SCRIPTS), err: (l: string) => err.push(l), out: () => undefined };
    expect(await main(['--out', join(ROOT, 'packages', 'nope')], deps)).toBe(3);
    expect(err[0]).toContain('refusing to write inside the repository');
  });

  it('runs a program and reports a failure by its exit status only, never its stderr', async () => {
    await expect(run('node', ['-e', 'process.stdout.write("ok")'])).resolves.toBe('ok');
    const error = (await run('node', [
      '-e',
      'process.stderr.write("private-repo-name"); process.exit(3)',
    ]).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toMatch(/ failed \(exit 3\)$/);
    expect(error.message.split(' failed')[1]).not.toContain('private-repo-name');
    await expect(run('/nonexistent/binary', [])).rejects.toThrow(/^\/nonexistent\/binary +failed$/);
  });
});
