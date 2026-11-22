import { SECTION_KEYS, type SnapshotDirReader } from '@watchman/core';
import full from '@watchman/core/fixtures/synthetic/full.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { FIXTURE_SOURCE, loadSnapshot, unavailableSnapshot } from './snapshot';

const NOW = new Date('2026-01-14T16:00:00Z');

const memory = (files: Record<string, string>, listError?: Error): SnapshotDirReader => ({
  list: () => (listError ? Promise.reject(listError) : Promise.resolve(Object.keys(files))),
  readText: (path) => {
    const text = files[path.split('/').pop()!];
    return text === undefined
      ? Promise.reject(Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' }))
      : Promise.resolve(text);
  },
});

describe('loadSnapshot', () => {
  it('serves the labelled synthetic fixture when WATCHMAN_SNAPSHOT_DIR is unset or blank', async () => {
    for (const env of [{}, { WATCHMAN_SNAPSHOT_DIR: '  ' }]) {
      const loaded = await loadSnapshot(env, NOW, memory({}));
      expect(loaded).toMatchObject({
        origin: 'synthetic-fixture',
        file: FIXTURE_SOURCE,
        skipped: [],
      });
      expect(loaded.snapshot.synthetic).toBe(true);
    }
  });

  it('reads the newest usable snapshot in the directory, naming files only', async () => {
    const loaded = await loadSnapshot(
      { WATCHMAN_SNAPSHOT_DIR: '/data/watchman' },
      NOW,
      memory({
        'snapshot-2026-01-14T14-00-00Z.json': JSON.stringify(full),
        'snapshot-2026-01-14T15-00-00Z.json': '{ truncated',
      }),
    );
    expect(loaded.origin).toBe('file');
    expect(loaded.file).toBe('file:snapshot-2026-01-14T14-00-00Z.json');
    expect(loaded.skipped).toEqual([
      {
        source: 'file:snapshot-2026-01-14T15-00-00Z.json',
        problem: expect.stringMatching(/not valid JSON/),
      },
    ]);
    expect(JSON.stringify(loaded)).not.toContain('/data/watchman');
  });

  it('never falls back to the fixture: an unreadable directory is no_data everywhere', async () => {
    const loaded = await loadSnapshot(
      { WATCHMAN_SNAPSHOT_DIR: '/data/watchman' },
      NOW,
      memory({}, Object.assign(new Error('EACCES /data/watchman'), { code: 'EACCES' })),
    );
    expect(loaded).toMatchObject({ origin: 'unavailable', file: 'snapshot directory' });
    for (const key of SECTION_KEYS) {
      expect(loaded.snapshot[key]).toMatchObject({
        state: 'no_data',
        reason: expect.stringMatching(/EACCES/),
      });
    }
    expect(loaded.snapshot.synthetic).toBeUndefined();
    expect(JSON.stringify(loaded)).not.toContain('/data/watchman');
  });

  it('reads a real directory with the default Node reader', async () => {
    const loaded = await loadSnapshot({ WATCHMAN_SNAPSHOT_DIR: '/nonexistent-watchman-dir' }, NOW);
    expect(loaded.origin).toBe('unavailable');
    expect(loaded.snapshot.flow).toMatchObject({ reason: expect.stringMatching(/ENOENT/) });
  });
});

describe('unavailableSnapshot', () => {
  it('stamps every section no_data at now', () => {
    const snapshot = unavailableSnapshot('gone', NOW);
    expect(snapshot.generated_at).toBe(NOW.toISOString());
    expect(snapshot.metrics).toEqual({
      state: 'no_data',
      reason: 'gone',
      source: 'watchman',
      as_of: NOW.toISOString(),
    });
  });
});
