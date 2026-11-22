import { describe, expect, it } from 'vitest';
import aiServices from '../fixtures/synthetic/exports/ai-services.json';
import spendSheet from '../fixtures/synthetic/exports/ai-surfaces-spend.json';
import cloudRuns from '../fixtures/synthetic/exports/cloud-runs.json';
import handoff from '../fixtures/synthetic/exports/handoff-board.json';
import {
  CONFIG_FILE,
  SnapshotSourceError,
  buildSnapshot,
  describeSnapshotShape,
  isInsidePath,
  parseSnapshot,
  readSnapshotConfig,
  snapshotAdapters,
  snapshotFileName,
} from './index';
import { NOW } from './test/builders';
import { fakeGh, type FakeWorld } from './test/fake-gh';
import { memoryDir } from './test/memory-fs';

const DIR = '/synthetic/snapshots';

const WORLD: FakeWorld = {
  viewer: 'sample-owner',
  accounts: { 'sample-owner': 'User' },
  repos: [
    {
      owner: 'sample-owner',
      name: 'alpha',
      openPrs: [
        {
          number: 1,
          title: 'Sample PR',
          createdAt: '2026-01-10T15:00:00Z',
          updatedAt: '2026-01-10T15:00:00Z',
        },
      ],
      openIssues: [
        {
          number: 2,
          title: 'Sample issue',
          createdAt: '2026-01-10T15:00:00Z',
          updatedAt: '2026-01-10T15:00:00Z',
        },
      ],
    },
    { owner: 'sample-owner', name: 'skip-me' },
    { owner: 'sample-owner', name: 'insulet-thing' },
  ],
};

const ALL_EXPORTS = {
  'handoff-board.json': handoff,
  'ai-services.json': aiServices,
  'cloud-runs.json': cloudRuns,
  'ai-surfaces-spend.json': spendSheet,
};

describe('buildSnapshot', () => {
  it('builds a valid snapshot with all four sections from GitHub and every export', async () => {
    const fs = memoryDir(DIR, {
      ...ALL_EXPORTS,
      [CONFIG_FILE]: { github: { exclude: ['skip-*'] }, utcOffsetMinutes: -300 },
    });
    const gh = fakeGh(WORLD);
    const built = await buildSnapshot({ ...fs, runGh: gh.run, now: NOW });

    expect(parseSnapshot(JSON.parse(JSON.stringify(built.snapshot))).ok).toBe(true);
    expect(built.failures).toEqual([]);
    expect(built.snapshot.attention.state).toBe('value');
    expect(built.snapshot.flow.state).toBe('value');
    expect(built.snapshot.spend.state).toBe('value');
    expect(built.snapshot.metrics).toMatchObject({
      state: 'no_data',
      reason: 'no scorecard source exists yet',
    });
    expect(built.sources.map((s) => [s.adapter, s.status])).toEqual([
      ['github', 'value'],
      ['handoff-board', 'value'],
      ['ai-services', 'value'],
      ['cloud-runs', 'value'],
      ['ai-surfaces-spend', 'value'],
      ['scorecard', 'no_data'],
    ]);
    const repos = gh.calls
      .filter((c) => c.includes('--repo'))
      .map((c) => c[c.indexOf('--repo') + 1]);
    expect([...new Set(repos)]).toEqual(['sample-owner/alpha']);
  });

  it('labels every absent source as no data and still writes all four sections', async () => {
    const built = await buildSnapshot({ ...memoryDir(DIR, {}), now: NOW });
    expect(built.failures).toEqual([]);
    for (const key of ['attention', 'flow', 'spend', 'metrics'] as const) {
      expect(built.snapshot[key].state).toBe('no_data');
    }
    expect(built.sources).toEqual([
      {
        adapter: 'handoff-board',
        status: 'no_data',
        sections: [],
        reason: 'handoff-board.json is not in the snapshot directory',
      },
      {
        adapter: 'ai-services',
        status: 'no_data',
        sections: [],
        reason: 'ai-services.json is not in the snapshot directory',
      },
      {
        adapter: 'cloud-runs',
        status: 'no_data',
        sections: [],
        reason: 'cloud-runs.json is not in the snapshot directory',
      },
      {
        adapter: 'ai-surfaces-spend',
        status: 'no_data',
        sections: [],
        reason: 'ai-surfaces-spend.json is not in the snapshot directory',
      },
      {
        adapter: 'scorecard',
        status: 'no_data',
        sections: [],
        reason: 'no scorecard source exists yet',
      },
    ]);
  });

  it('lists a failing source and keeps the others', async () => {
    const fs = memoryDir(DIR, { 'ai-surfaces-spend.json': spendSheet });
    const built = await buildSnapshot({
      ...fs,
      runGh: () => Promise.reject(new Error('gh is not signed in')),
      now: NOW,
    });
    expect(built.failures).toEqual([{ adapter: 'github', message: 'gh is not signed in' }]);
    expect(built.sources[0]).toMatchObject({
      adapter: 'github',
      status: 'failed',
      reason: 'gh is not signed in',
    });
    expect(built.snapshot.spend.state).toBe('value');
    expect(built.snapshot.flow).toMatchObject({ state: 'no_data' });
  });

  it('skips GitHub when the config disables it', async () => {
    const fs = memoryDir(DIR, { [CONFIG_FILE]: { github: { enabled: false } } });
    const adapters = snapshotAdapters(await readSnapshotConfig(fs), {
      ...fs,
      runGh: fakeGh(WORLD).run,
    });
    expect(adapters.map((a) => a.id)).not.toContain('github');
  });
});

describe('readSnapshotConfig', () => {
  it('defaults when absent and refuses a bad file without leaking the directory', async () => {
    expect(await readSnapshotConfig(memoryDir(DIR, {}))).toEqual({});
    const secret = '/private/owner/data';
    await expect(readSnapshotConfig(memoryDir(secret, { [CONFIG_FILE]: '{' }))).rejects.toThrow(
      `${CONFIG_FILE}: not valid JSON`,
    );
    await expect(
      readSnapshotConfig(
        memoryDir(secret, { [CONFIG_FILE]: { github: { owner: 'x', token: 'y' } } }),
      ),
    ).rejects.toThrow(SnapshotSourceError);
    await expect(
      readSnapshotConfig({
        dir: secret,
        readText: () => Promise.reject(Object.assign(new Error(secret), { code: 'EISDIR' })),
      }),
    ).rejects.toThrow(`${CONFIG_FILE}: could not be read (EISDIR)`);
    await expect(
      readSnapshotConfig({ dir: secret, readText: () => Promise.reject('odd') }),
    ).rejects.toThrow(`${CONFIG_FILE}: could not be read`);
  });
});

describe('snapshotFileName', () => {
  it('names the file after the ISO instant, safe on every file system', () => {
    expect(snapshotFileName(new Date('2026-11-22T19:07:28.458Z'))).toBe(
      'snapshot-2026-11-22T19-07-28Z.json',
    );
  });
});

describe('isInsidePath', () => {
  it.each([
    ['/repo', '/repo', true],
    ['/repo/data', '/repo', true],
    ['/repo/', '/repo', true],
    ['/repo-data', '/repo', false],
    ['/elsewhere', '/repo', false],
    ['C:\\repo\\data', 'C:\\repo', true],
    ['/anything', '/', true],
  ])('%s inside %s is %s', (child, parent, expected) => {
    expect(isInsidePath(child, parent)).toBe(expected);
  });
});

describe('describeSnapshotShape', () => {
  it('prints sections, counts and source states, never a figure, title or name', async () => {
    const fs = memoryDir(DIR, ALL_EXPORTS);
    const built = await buildSnapshot({ ...fs, runGh: fakeGh(WORLD).run, now: NOW });
    const lines = describeSnapshotShape(built);
    expect(lines.slice(0, 4)).toEqual([
      'attention: value (5 candidates)',
      // No config here, so skip-me is read; the NDA-named repository never is.
      'flow: value (2 projects, 10 work items, board value)',
      'spend: value (3 providers)',
      'metrics: no_data',
    ]);
    const text = lines.join('\n');
    for (const leak of ['alpha', 'Sample', 'example.com', '80000', '40', 'Provider']) {
      expect(text).not.toContain(leak);
    }
  });

  it('describes a metrics section with values by project count', () => {
    const lines = describeSnapshotShape({
      snapshot: {
        schema_version: 1,
        generated_at: NOW.toISOString(),
        attention: { state: 'no_data', reason: 'x', source: 's', as_of: NOW.toISOString() },
        flow: { state: 'no_data', reason: 'x', source: 's', as_of: NOW.toISOString() },
        spend: { state: 'no_data', reason: 'x', source: 's', as_of: NOW.toISOString() },
        metrics: { state: 'value', source: 's', as_of: NOW.toISOString(), projects: [] },
      },
      failures: [],
      sources: [],
    });
    expect(lines).toEqual([
      'attention: no_data',
      'flow: no_data',
      'spend: no_data',
      'metrics: value (0 projects)',
    ]);
  });
});
