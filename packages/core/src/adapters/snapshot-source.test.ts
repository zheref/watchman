import { describe, expect, it } from 'vitest';
import full from '../../fixtures/synthetic/full.json';
import { SECTION_KEYS } from '../snapshot';
import type { SnapshotDirReader } from './file';
import {
  UNAVAILABLE_SNAPSHOT_SOURCE,
  resolveSnapshotSource,
  unavailableSnapshot,
} from './snapshot-source';

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

const options = (reader: SnapshotDirReader) => ({
  reader,
  fixture: full,
  fixtureSource: 'synthetic fixture full.json',
});

describe('resolveSnapshotSource', () => {
  it('serves the given fixture, labelled, when the directory is unset or blank', async () => {
    for (const env of [{}, { WATCHMAN_SNAPSHOT_DIR: '  ' }]) {
      const resolved = await resolveSnapshotSource(env, NOW, options(memory({})));
      expect(resolved).toMatchObject({
        origin: 'synthetic-fixture',
        source: 'synthetic fixture full.json',
        skipped: [],
      });
      expect(resolved.snapshot.synthetic).toBe(true);
      expect(resolved).not.toHaveProperty('problem');
    }
  });

  it('reads the newest usable file, naming files only', async () => {
    const resolved = await resolveSnapshotSource(
      { WATCHMAN_SNAPSHOT_DIR: '/data/watchman' },
      NOW,
      options(
        memory({
          'snapshot-2026-01-14T14-00-00Z.json': JSON.stringify(full),
          'snapshot-2026-01-14T15-00-00Z.json': '{ truncated',
        }),
      ),
    );
    expect(resolved).toMatchObject({
      origin: 'file',
      source: 'file:snapshot-2026-01-14T14-00-00Z.json',
      skipped: [{ source: 'file:snapshot-2026-01-14T15-00-00Z.json' }],
    });
    expect(JSON.stringify(resolved)).not.toContain('/data/watchman');
  });

  it('never falls back to the fixture: an unreadable directory is no_data everywhere', async () => {
    const resolved = await resolveSnapshotSource(
      { WATCHMAN_SNAPSHOT_DIR: '/data/watchman' },
      NOW,
      options(memory({}, Object.assign(new Error('EACCES /data/watchman'), { code: 'EACCES' }))),
    );
    expect(resolved).toMatchObject({
      origin: 'unavailable',
      source: UNAVAILABLE_SNAPSHOT_SOURCE,
      problem: expect.stringMatching(/EACCES/),
    });
    for (const key of SECTION_KEYS) {
      expect(resolved.snapshot[key]).toMatchObject({ state: 'no_data' });
    }
    expect(resolved.snapshot.synthetic).toBeUndefined();
    expect(JSON.stringify(resolved)).not.toContain('/data/watchman');
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
