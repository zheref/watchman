import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import full from '@watchman/core/fixtures/synthetic/full.json';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SECTION_KEYS, resolveSnapshotSource, type SnapshotDirReader } from '@watchman/core';
import { FIXTURE_SOURCE, readDashboardData } from './snapshot';

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

const memory = (files: Record<string, string>, listError?: Error): SnapshotDirReader => ({
  list: () => (listError ? Promise.reject(listError) : Promise.resolve(Object.keys(files))),
  readText: (path: string) => {
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
    const cases: [SnapshotDirReader, RegExp][] = [
      [
        memory({}, Object.assign(new Error('EACCES /secret/dir'), { code: 'EACCES' })),
        /listed \(EACCES\)/,
      ],
      [memory({ 'notes.txt': '' }), /no snapshot-\*\.json or snapshot\.json/],
      [memory({ 'snapshot.json': '{"broken": ' }), /not valid JSON/],
      [
        memory({ 'snapshot.json': '{"schema_version": 1, "secret": "x"}' }),
        /file:snapshot\.json: not a valid snapshot \(\d+ problems at /,
      ],
    ];
    for (const [files, problem] of cases) {
      const data = await readDashboardData({ WATCHMAN_SNAPSHOT_DIR: '/secret/dir' }, NOW, files);
      expect(data).toMatchObject({ origin: 'unavailable', source: 'snapshot directory' });
      expect(data.problem).toMatch(problem);
      expect(JSON.stringify(data)).not.toMatch(/\/secret\/dir|"x"/);
      expect(data.snapshot.generated_at).toBe(NOW.toISOString());
      for (const key of SECTION_KEYS) {
        expect(data.snapshot[key]).toEqual({
          state: 'no_data',
          reason: data.problem,
          source: 'watchman',
          as_of: NOW.toISOString(),
        });
      }
      expect(data.snapshot.synthetic).toBeUndefined();
    }
  });

  it('shows an older snapshot when the newest is unusable, and says so', async () => {
    const data = await readDashboardData(
      { WATCHMAN_SNAPSHOT_DIR: '/x' },
      NOW,
      memory({
        'snapshot-2026-01-14T16-00-00Z.json': '{"half": ',
        'snapshot-2026-01-14T15-00-00Z.json': JSON.stringify(full),
      }),
    );
    expect(data).toMatchObject({
      origin: 'file',
      source: 'file:snapshot-2026-01-14T15-00-00Z.json',
      skipped: [{ source: 'file:snapshot-2026-01-14T16-00-00Z.json' }],
    });
  });
});

describe('the source rule', () => {
  it("is core's resolveSnapshotSource, plus only the time of the read", async () => {
    const cases: [Record<string, string>, SnapshotDirReader][] = [
      [{}, memory({})],
      [
        { WATCHMAN_SNAPSHOT_DIR: '/x' },
        memory({ 'snapshot-2026-01-14T15-00-00Z.json': JSON.stringify(full) }),
      ],
      [
        { WATCHMAN_SNAPSHOT_DIR: '/x' },
        memory({}, Object.assign(new Error('EACCES'), { code: 'EACCES' })),
      ],
    ];
    for (const [env, reader] of cases) {
      const core = await resolveSnapshotSource(env, NOW, {
        reader,
        fixture: full,
        fixtureSource: FIXTURE_SOURCE,
      });
      expect(await readDashboardData(env, NOW, reader)).toEqual({
        ...core,
        read_at: NOW.toISOString(),
      });
    }
  });
});
