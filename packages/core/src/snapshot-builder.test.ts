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
    // The same outcomes are written into the snapshot itself, for the artifact to show.
    expect(built.snapshot.sources).toEqual([
      {
        adapter: 'handoff-board',
        status: 'no_data',
        feeds: ['attention', 'flow'],
        reason: 'handoff-board.json is not in the snapshot directory',
      },
      {
        adapter: 'ai-services',
        status: 'no_data',
        feeds: ['attention', 'flow'],
        reason: 'ai-services.json is not in the snapshot directory',
      },
      {
        adapter: 'cloud-runs',
        status: 'no_data',
        feeds: ['attention', 'flow'],
        reason: 'cloud-runs.json is not in the snapshot directory',
      },
      {
        adapter: 'ai-surfaces-spend',
        status: 'no_data',
        feeds: ['spend'],
        reason: 'ai-surfaces-spend.json is not in the snapshot directory',
      },
      {
        adapter: 'scorecard',
        status: 'no_data',
        feeds: ['metrics'],
        reason: 'no scorecard source exists yet',
      },
    ]);
    expect(built.snapshot.utc_offset_minutes).toBeUndefined();
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

  it('writes a failed source into the snapshot, so a merged section reads as partial', async () => {
    const fs = memoryDir(DIR, {
      'handoff-board.json': handoff,
      [CONFIG_FILE]: { utcOffsetMinutes: -300 },
    });
    const built = await buildSnapshot({
      ...fs,
      runGh: () => Promise.reject(new Error('gh pr list failed (exit 1)')),
      now: NOW,
    });
    expect(built.snapshot.flow.state).toBe('value');
    expect(built.snapshot.sources?.[0]).toEqual({
      adapter: 'github',
      status: 'failed',
      feeds: ['attention', 'flow'],
      reason: 'gh pr list failed (exit 1)',
    });
    expect(built.snapshot.utc_offset_minutes).toBe(-300);
    expect(parseSnapshot(JSON.parse(JSON.stringify(built.snapshot))).ok).toBe(true);
  });

  it('gives a missing board the handoff board’s own reason, not a placeholder', async () => {
    const built = await buildSnapshot({
      ...memoryDir(DIR, { 'ai-services.json': aiServices }),
      runGh: fakeGh(WORLD).run,
      now: NOW,
    });
    if (built.snapshot.flow.state !== 'value') throw new Error('expected flow');
    expect(built.snapshot.flow.board).toEqual({
      state: 'no_data',
      reason: 'handoff-board.json is not in the snapshot directory',
      source: 'handoff-board',
      as_of: NOW.toISOString(),
    });
    const failed = await buildSnapshot({
      dir: DIR,
      readText: (path) =>
        path.endsWith('handoff-board.json')
          ? Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' }))
          : memoryDir(DIR, { 'ai-services.json': aiServices }).readText(path),
      now: NOW,
    });
    if (failed.snapshot.flow.state !== 'value') throw new Error('expected flow');
    expect(failed.snapshot.flow.board).toMatchObject({
      reason: 'the handoff board failed: manual:handoff-board.json: could not be read (EACCES)',
    });
  });

  it('drops excluded material from every export, however it is spelt', async () => {
    const card = handoff.cards[0]!;
    const fs = memoryDir(DIR, {
      'handoff-board.json': {
        ...handoff,
        cards: [
          ...handoff.cards,
          { ...card, id: 'nda-1', project: 'Global Logic port' },
          { ...card, id: 'nda-2', title: 'Notes on IN\u200bSULET' },
        ],
      },
      'ai-services.json': {
        ...aiServices,
        items: [
          ...aiServices.items,
          { ...aiServices.items[0]!, id: 'nda-3', url: 'https://example.com/global_logic/x' },
        ],
      },
      'ai-surfaces-spend.json': {
        ...spendSheet,
        providers: [...spendSheet.providers, { id: 'nda-4', label: 'GLOBAL-LOGIC seat' }],
      },
    });
    const built = await buildSnapshot({ ...fs, now: NOW });
    const text = JSON.stringify(built.snapshot);
    expect(text).not.toMatch(/nda-\d/);
    expect(built.dropped).toBeGreaterThanOrEqual(6);
    expect(parseSnapshot(JSON.parse(text)).ok).toBe(true);
  });

  it('withholds a failure reason or a label that mentions excluded material', async () => {
    const built = await buildSnapshot({
      ...memoryDir(DIR, { 'ai-surfaces-spend.json': { ...spendSheet, source: 'insulet sheet' } }),
      runGh: () => Promise.reject(new Error('could not read insulet-tools')),
      now: NOW,
    });
    expect(built.snapshot.sources?.[0]?.reason).toBe('withheld: it mentions excluded material');
    expect(JSON.stringify(built.snapshot)).not.toMatch(/insulet/i);
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
      dropped: 0,
    });
    expect(lines).toEqual([
      'attention: no_data',
      'flow: no_data',
      'spend: no_data',
      'metrics: value (0 projects)',
    ]);
  });
});
