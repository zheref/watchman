import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import full from '@watchman/core/fixtures/synthetic/full.json';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FIXTURE_SOURCE,
  readDashboardData,
  unavailableSnapshot,
  type SnapshotFiles,
} from './snapshot';

const NOW = new Date('2026-11-22T20:00:00Z');
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'watchman-web-snapshot-'));
  const older = { ...full, generated_at: '2026-01-14T14:00:00Z' };
  await writeFile(join(dir, 'snapshot-2026-01-14T14-00-00Z.json'), JSON.stringify(older));
  await writeFile(join(dir, 'snapshot-2026-01-14T15-00-00Z.json'), JSON.stringify(full));
  await writeFile(join(dir, 'snapshot.json'), '{}');
  await writeFile(join(dir, 'notes.txt'), 'not a snapshot');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const memory = (files: Record<string, string>, listError?: Error): SnapshotFiles => ({
  list: () => (listError ? Promise.reject(listError) : Promise.resolve(Object.keys(files))),
  readText: (path) => {
    const name = path.split('/').pop()!;
    const text = files[name];
    return text === undefined
      ? Promise.reject(Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' }))
      : Promise.resolve(text);
  },
});

describe('readDashboardData', () => {
  it('serves the synthetic fixture, labelled, when WATCHMAN_SNAPSHOT_DIR is unset', async () => {
    const data = await readDashboardData({}, NOW);
    expect(data).toMatchObject({
      origin: 'synthetic-fixture',
      source: FIXTURE_SOURCE,
      read_at: NOW.toISOString(),
    });
    expect(data.snapshot.synthetic).toBe(true);
  });

  it('reads the newest snapshot-<ISO>.json from the directory, on disk', async () => {
    const data = await readDashboardData({ WATCHMAN_SNAPSHOT_DIR: `${dir}/` }, NOW);
    expect(data).toMatchObject({
      origin: 'file',
      source: 'file:snapshot-2026-01-14T15-00-00Z.json',
    });
    expect(data.snapshot.generated_at).toBe('2026-01-14T15:00:00Z');
    expect(JSON.stringify(data)).not.toContain(dir);
  });

  it('falls back to a hand-placed snapshot.json, never to the fixture', async () => {
    const data = await readDashboardData(
      { WATCHMAN_SNAPSHOT_DIR: '/data' },
      NOW,
      memory({ 'snapshot.json': JSON.stringify(full) }),
    );
    expect(data).toMatchObject({ origin: 'file', source: 'file:snapshot.json' });
  });

  it('shows every tile as no data, with a path-free reason, when nothing can be shown', async () => {
    const cases: [SnapshotFiles, RegExp][] = [
      [
        memory({}, Object.assign(new Error('EACCES /secret/dir'), { code: 'EACCES' })),
        /listed \(EACCES\)/,
      ],
      [memory({}, new Error('odd')), /could not be listed$/],
      [memory({ 'notes.txt': '' }), /no snapshot-\*\.json/],
      [memory({ 'snapshot.json': '{"broken": ' }), /not valid JSON/],
      [memory({ 'snapshot.json': '{"schema_version": 1}' }), /invalid file:snapshot\.json/],
    ];
    for (const [files, problem] of cases) {
      const data = await readDashboardData({ WATCHMAN_SNAPSHOT_DIR: '/secret/dir' }, NOW, files);
      expect(data.origin).toBe('unavailable');
      expect(data.problem).toMatch(problem);
      expect(JSON.stringify(data)).not.toContain('/secret/dir');
      expect(data.snapshot.attention).toMatchObject({ state: 'no_data', reason: data.problem });
      expect(data.snapshot.synthetic).toBeUndefined();
    }
  });

  it('names a file it listed but could not read, with the code only', async () => {
    const files: SnapshotFiles = {
      list: () => Promise.resolve(['snapshot-2026-01-14T15-00-00Z.json']),
      readText: () => Promise.reject(Object.assign(new Error('EISDIR /x'), { code: 'EISDIR' })),
    };
    const data = await readDashboardData({ WATCHMAN_SNAPSHOT_DIR: '/x' }, NOW, files);
    expect(data.problem).toBe(
      'file:snapshot-2026-01-14T15-00-00Z.json: could not be read (EISDIR)',
    );
    const noCode: SnapshotFiles = { ...files, readText: () => Promise.reject(new Error('boom')) };
    expect((await readDashboardData({ WATCHMAN_SNAPSHOT_DIR: '/x' }, NOW, noCode)).problem).toBe(
      'file:snapshot-2026-01-14T15-00-00Z.json: could not be read',
    );
  });
});

describe('unavailableSnapshot', () => {
  it('is a valid snapshot with every section no data', () => {
    const snapshot = unavailableSnapshot('why', NOW);
    for (const key of ['attention', 'flow', 'spend', 'metrics'] as const) {
      expect(snapshot[key]).toMatchObject({ state: 'no_data', reason: 'why', source: 'watchman' });
    }
  });
});
