import { describe, expect, it } from 'vitest';
import fullFixture from '../../fixtures/synthetic/full.json';
import {
  DEFAULT_SNAPSHOT_FILE,
  SNAPSHOT_DIR_ENV,
  SnapshotSourceError,
  SnapshotValidationError,
  collectSnapshot,
  createFileSnapshotAdapter,
  latestSnapshotFileName,
  parseSnapshotText,
  readLatestSnapshot,
  type SnapshotDirReader,
  resolveSnapshotDir,
  snapshotFileName,
} from '../index';
import { NOW } from '../test/builders';

const memoryReader = (files: Record<string, string>) => {
  const reads: string[] = [];
  const readText = (path: string) => {
    reads.push(path);
    const text = files[path];
    return text === undefined ? Promise.reject(new Error(`ENOENT ${path}`)) : Promise.resolve(text);
  };
  return { readText, reads };
};

describe('resolveSnapshotDir', () => {
  it('reads the directory from WATCHMAN_SNAPSHOT_DIR and has no fallback', () => {
    expect(SNAPSHOT_DIR_ENV).toBe('WATCHMAN_SNAPSHOT_DIR');
    expect(resolveSnapshotDir({ WATCHMAN_SNAPSHOT_DIR: ' /data/snapshots ' })).toBe(
      '/data/snapshots',
    );
    expect(resolveSnapshotDir({ WATCHMAN_SNAPSHOT_DIR: '   ' })).toBeNull();
    expect(resolveSnapshotDir({})).toBeNull();
  });
});

describe('createFileSnapshotAdapter', () => {
  it('reads snapshot.json from the directory and reports all four sections', async () => {
    const { readText, reads } = memoryReader({
      '/data/snapshot.json': JSON.stringify(fullFixture),
    });
    const adapter = createFileSnapshotAdapter({ dir: '/data/', readText });
    const report = await adapter.fetch({ now: NOW });
    expect(adapter.id).toBe('file');
    expect(reads).toEqual(['/data/snapshot.json']);
    expect(report).toMatchObject({
      source: `file:${DEFAULT_SNAPSHOT_FILE}`,
      as_of: '2026-01-14T15:00:00Z',
      synthetic: true,
    });
    expect(Object.keys(report.sections).sort()).toEqual(['attention', 'flow', 'metrics', 'spend']);
  });

  it('feeds collectSnapshot end to end', async () => {
    const { readText } = memoryReader({ '/d/full.json': JSON.stringify(fullFixture) });
    const adapter = createFileSnapshotAdapter({ dir: '/d', fileName: 'full.json', readText });
    const { snapshot, failures } = await collectSnapshot([adapter], { now: NOW });
    expect(failures).toEqual([]);
    expect(snapshot.synthetic).toBe(true);
    expect(snapshot.attention.state).toBe('value');
  });

  it('keeps the directory out of every error message', async () => {
    const secretDir = '/private/owner/data';
    const cases: Record<string, string> = {
      'missing.json': '',
      'broken.json': '{ not json',
      'invalid.json': JSON.stringify({ schema_version: 1 }),
    };
    const files = Object.fromEntries(
      Object.entries(cases)
        .filter(([name]) => name !== 'missing.json')
        .map(([name, text]) => [`${secretDir}/${name}`, text]),
    );
    const { readText: memory } = memoryReader(files);
    // Like Node's readFile: a missing file rejects with a code and a message naming the path.
    const readText = (path: string) =>
      memory(path).catch(() =>
        Promise.reject(
          Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
            code: 'ENOENT',
          }),
        ),
      );
    const run = (fileName: string) =>
      createFileSnapshotAdapter({ dir: secretDir, fileName, readText }).fetch({ now: NOW });

    await expect(run('missing.json')).rejects.toThrow(SnapshotSourceError);
    await expect(run('missing.json')).rejects.toMatchObject({
      message: 'file:missing.json: could not be read (ENOENT)',
      cause: { code: 'ENOENT' },
    });
    await expect(run('broken.json')).rejects.toThrow('file:broken.json: not valid JSON');
    await expect(run('invalid.json')).rejects.toThrow(SnapshotValidationError);
    for (const name of Object.keys(cases)) {
      const error = (await run(name).then(
        () => null,
        (e: unknown) => e,
      )) as Error & { cause?: unknown };
      expect(error.message).not.toContain(secretDir);
      expect(JSON.stringify(error.cause ?? null)).not.toContain(secretDir);
      expect(String(error.stack)).not.toContain(secretDir);
    }
  });

  it('reports a read failure without a code plainly', async () => {
    const adapter = createFileSnapshotAdapter({
      dir: '/d',
      readText: () => Promise.reject('no code'),
    });
    const error = (await adapter.fetch({ now: NOW }).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toBe('file:snapshot.json: could not be read');
    expect(error.cause).toBeUndefined();
  });

  it.each(['../snapshot.json', 'a/b.json', 'snapshot.txt', '.hidden.json', 'x..json'])(
    'refuses the unsafe file name %s',
    (fileName) => {
      expect(() =>
        createFileSnapshotAdapter({ dir: '/d', fileName, readText: () => Promise.resolve('') }),
      ).toThrow(RangeError);
    },
  );

  it('refuses an empty directory', () => {
    expect(() =>
      createFileSnapshotAdapter({ dir: '  ', readText: () => Promise.resolve('') }),
    ).toThrow(RangeError);
  });
});

describe('latestSnapshotFileName', () => {
  it('picks the newest snapshot-<ISO>.json and ignores every other name', () => {
    expect(
      latestSnapshotFileName([
        'snapshot-2026-11-22T19-07-28Z.json',
        'watchman.config.json',
        'snapshot-2026-11-23T08-00-00Z.json',
        'snapshot.json',
        'snapshot-2026-11-23T08-00-00Z.json.tmp',
        'snapshot-latest.json',
        'snapshot-2026-11-21T23-59-59Z.json',
      ]),
    ).toBe('snapshot-2026-11-23T08-00-00Z.json');
  });

  it('is null when no file matches', () => {
    expect(latestSnapshotFileName([])).toBeNull();
    expect(latestSnapshotFileName(['snapshot.json', 'notes.txt'])).toBeNull();
  });

  it('accepts exactly what the builder writes', () => {
    const name = snapshotFileName(new Date('2026-11-22T19:07:28.458Z'));
    expect(latestSnapshotFileName([name])).toBe(name);
  });
});

describe('parseSnapshotText', () => {
  it('returns the whole validated snapshot, sources and offset included', () => {
    const snapshot = parseSnapshotText(JSON.stringify(fullFixture), 'file:x.json');
    expect(snapshot.generated_at).toBe('2026-01-14T15:00:00Z');
    expect(snapshot.synthetic).toBe(true);
  });

  it('names the source, never the text, on bad JSON or an invalid snapshot', () => {
    expect(() => parseSnapshotText('{"secret": ', 'file:x.json')).toThrow(
      new SnapshotSourceError('file:x.json: not valid JSON'),
    );
    expect(() => parseSnapshotText('{"schema_version": 1}', 'file:x.json')).toThrow(
      SnapshotValidationError,
    );
  });
});

describe('readLatestSnapshot', () => {
  const good = JSON.stringify(fullFixture);
  const dirReader = (
    files: Record<string, string | Error>,
    listError?: Error,
  ): SnapshotDirReader & { reads: string[] } => {
    const reads: string[] = [];
    return {
      reads,
      list: () => (listError ? Promise.reject(listError) : Promise.resolve(Object.keys(files))),
      readText: (path) => {
        reads.push(path);
        const value = files[path.split('/').pop()!];
        return value instanceof Error || value === undefined
          ? Promise.reject(value ?? new Error('missing'))
          : Promise.resolve(value);
      },
    };
  };
  const coded = (code: string) => Object.assign(new Error(`${code} /secret/dir`), { code });

  it('reads the newest snapshot-<ISO>.json and names it by file only', async () => {
    const reader = dirReader({
      'snapshot-2026-01-14T14-00-00Z.json': good,
      'snapshot-2026-01-14T15-00-00Z.json': good,
      'snapshot.json': good,
      'notes.txt': 'x',
    });
    const result = await readLatestSnapshot('/secret/dir/', reader);
    expect(result).toMatchObject({ ok: true, source: 'file:snapshot-2026-01-14T15-00-00Z.json' });
    expect(reader.reads).toEqual(['/secret/dir/snapshot-2026-01-14T15-00-00Z.json']);
  });

  it('falls back past a broken newest file and lists what it skipped, path-free', async () => {
    const result = await readLatestSnapshot(
      '/secret/dir',
      dirReader({
        'snapshot-2026-01-14T16-00-00Z.json': '{"half": ',
        'snapshot-2026-01-14T15-00-00Z.json': JSON.stringify({ ...fullFixture, schema_version: 9 }),
        'snapshot-2026-01-14T14-00-00Z.json': good,
      }),
    );
    expect(result).toMatchObject({ ok: true, source: 'file:snapshot-2026-01-14T14-00-00Z.json' });
    expect(result.skipped.map((s) => s.problem)).toEqual([
      'file:snapshot-2026-01-14T16-00-00Z.json: not valid JSON',
      'file:snapshot-2026-01-14T15-00-00Z.json: not a valid snapshot (1 problem at schema_version)',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|"9"| 9/);
  });

  it('uses a hand-placed snapshot.json when no snapshot-<ISO>.json exists', async () => {
    const result = await readLatestSnapshot('/d', dirReader({ 'snapshot.json': good }));
    expect(result).toMatchObject({ ok: true, source: 'file:snapshot.json' });
  });

  it('reports why nothing could be shown, with codes only', async () => {
    expect(await readLatestSnapshot('/secret/dir', dirReader({}, coded('EACCES')))).toEqual({
      ok: false,
      problem: 'the snapshot directory could not be listed (EACCES)',
      skipped: [],
    });
    expect(await readLatestSnapshot('/d', dirReader({}, new Error('odd')))).toMatchObject({
      problem: 'the snapshot directory could not be listed',
    });
    expect(await readLatestSnapshot('/d', dirReader({ 'a.txt': '' }))).toMatchObject({
      ok: false,
      problem: 'no snapshot-*.json or snapshot.json in the snapshot directory yet',
    });
    const unreadable = await readLatestSnapshot(
      '/secret/dir',
      dirReader({
        'snapshot.json': coded('EISDIR'),
        'snapshot-2026-01-14T15-00-00Z.json': new Error('x'),
      }),
    );
    expect(unreadable).toMatchObject({
      ok: false,
      problem: 'file:snapshot-2026-01-14T15-00-00Z.json: could not be read',
    });
    expect(unreadable.skipped[1]?.problem).toBe('file:snapshot.json: could not be read (EISDIR)');
  });

  it('tries at most three snapshot files, then snapshot.json', async () => {
    const files: Record<string, string> = { 'snapshot.json': '{' };
    for (const h of ['10', '11', '12', '13']) files[`snapshot-2026-01-14T${h}-00-00Z.json`] = '{';
    const result = await readLatestSnapshot('/d', dirReader(files));
    expect(result.skipped.map((s) => s.source)).toEqual([
      'file:snapshot-2026-01-14T13-00-00Z.json',
      'file:snapshot-2026-01-14T12-00-00Z.json',
      'file:snapshot-2026-01-14T11-00-00Z.json',
      'file:snapshot.json',
    ]);
  });
});
