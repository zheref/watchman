import { describe, expect, it } from 'vitest';
import fullFixture from '../../fixtures/synthetic/full.json';
import {
  DEFAULT_SNAPSHOT_FILE,
  SNAPSHOT_DIR_ENV,
  SnapshotSourceError,
  SnapshotValidationError,
  collectSnapshot,
  createFileSnapshotAdapter,
  resolveSnapshotDir,
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
    const { readText } = memoryReader(files);
    const run = (fileName: string) =>
      createFileSnapshotAdapter({ dir: secretDir, fileName, readText }).fetch({ now: NOW });

    await expect(run('missing.json')).rejects.toThrow(SnapshotSourceError);
    await expect(run('broken.json')).rejects.toThrow('file:broken.json: not valid JSON');
    await expect(run('invalid.json')).rejects.toThrow(SnapshotValidationError);
    for (const name of Object.keys(cases)) {
      await run(name).catch((error: Error) => expect(error.message).not.toContain(secretDir));
    }
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
