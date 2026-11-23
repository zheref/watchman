import { describe, expect, it } from 'vitest';
import aiServices from '../../fixtures/synthetic/exports/ai-services.json';
import spendSheet from '../../fixtures/synthetic/exports/ai-surfaces-spend.json';
import cloudRuns from '../../fixtures/synthetic/exports/cloud-runs.json';
import handoff from '../../fixtures/synthetic/exports/handoff-board.json';
import config from '../../fixtures/synthetic/exports/watchman.config.json';
import {
  EXPORT_FILES,
  SnapshotSourceError,
  aiServicesExportSchema,
  aiSurfacesSpendExportSchema,
  cloudRunsExportSchema,
  collectSnapshot,
  createAiSurfacesSpendAdapter,
  createHandoffBoardAdapter,
  createScorecardPlaceholderAdapter,
  createTrackerAdapter,
  handoffBoardExportSchema,
  rankAttention,
  snapshotConfigSchema,
} from '../index';
import { NOW } from '../test/builders';
import { memoryDir } from '../test/memory-fs';

const DIR = '/synthetic/snapshots';

function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node !== null && typeof node === 'object') return Object.values(node).flatMap(strings);
  return [];
}

describe('synthetic export fixtures', () => {
  const exportsByFile = {
    [EXPORT_FILES['handoff-board']]: [handoff, handoffBoardExportSchema],
    [EXPORT_FILES['ai-services']]: [aiServices, aiServicesExportSchema],
    [EXPORT_FILES['cloud-runs']]: [cloudRuns, cloudRunsExportSchema],
    [EXPORT_FILES['ai-surfaces-spend']]: [spendSheet, aiSurfacesSpendExportSchema],
  } as const;

  it.each(Object.entries(exportsByFile))(
    '%s is synthetic, valid and links only to example.com',
    (_f, [json, schema]) => {
      expect((json as { synthetic?: unknown }).synthetic).toBe(true);
      expect(schema.safeParse(json).success).toBe(true);
      for (const value of strings(json)) {
        if (value.includes('://')) expect(value).toMatch(/^https:\/\/example\.com\//);
        expect(value).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      }
    },
  );

  it('the example config validates', () => {
    expect(snapshotConfigSchema.safeParse(config).success).toBe(true);
  });
});

describe('handoff board adapter', () => {
  it('reports the board, card work items and waiting cards, all manual', async () => {
    const fs = memoryDir(DIR, { 'handoff-board.json': handoff });
    const report = await createHandoffBoardAdapter(fs).fetch({ now: NOW });
    expect(fs.reads).toEqual([`${DIR}/handoff-board.json`]);
    expect(report).toMatchObject({ source: 'manual:handoff-board.json', synthetic: true });
    const flow = report.sections.flow!;
    const attention = report.sections.attention!;
    if (flow.state !== 'value' || attention.state !== 'value') throw new Error('expected values');
    expect(flow.manual).toBe(true);
    expect(flow.board).toMatchObject({
      state: 'value',
      manual: true,
      columns: [
        { name: 'Backlog', count: 1 },
        { name: 'In progress', count: 1 },
        { name: 'Blocked', count: 1 },
        { name: 'Done', count: 1 },
      ],
    });
    expect(flow.work_items.every((w) => w.kind === 'card' && w.manual === true)).toBe(true);
    expect(attention.candidates.map((c) => [c.id, c.kind, c.value, c.waiting_since])).toEqual([
      ['handoff-board:card-1', 'blocked_card', 4, '2026-01-08T10:00:00Z'],
      ['handoff-board:card-2', 'owner_decision', 3, '2026-01-13T10:00:00Z'],
    ]);
  });

  it('appends columns seen only on cards and honours a declared source', async () => {
    const fs = memoryDir(DIR, {
      'handoff-board.json': { ...handoff, columns: ['Done'], source: 'sample board' },
    });
    const report = await createHandoffBoardAdapter(fs).fetch({ now: NOW });
    const flow = report.sections.flow!;
    if (flow.state !== 'value' || flow.board.state !== 'value') throw new Error('expected values');
    expect(flow.board.columns.map((c) => c.name)).toEqual([
      'Done',
      'Blocked',
      'In progress',
      'Backlog',
    ]);
    expect(flow.board.source).toBe('sample board');
  });

  it('reports no data, naming the file, when the export is absent', async () => {
    const report = await createHandoffBoardAdapter(memoryDir(DIR, {})).fetch({ now: NOW });
    expect(report.sections.flow).toMatchObject({
      state: 'no_data',
      reason: 'handoff-board.json is not in the snapshot directory',
    });
    expect(report.sections.attention?.state).toBe('no_data');
  });

  it('refuses a bad export without leaking the directory', async () => {
    const secret = '/private/owner/data';
    const cases: [unknown, string][] = [
      ['{ nope', 'manual:handoff-board.json: not valid JSON'],
      [{ ...handoff, version: 2 }, 'manual:handoff-board.json: version'],
      [
        { ...handoff, cards: [{ ...handoff.cards[0], url: 'http://example.com/x' }] },
        'cards.0.url',
      ],
    ];
    for (const [file, message] of cases) {
      const error = (await createHandoffBoardAdapter(
        memoryDir(secret, { 'handoff-board.json': file }),
      )
        .fetch({ now: NOW })
        .then(
          () => null,
          (e: unknown) => e,
        )) as Error;
      expect(error).toBeInstanceOf(SnapshotSourceError);
      expect(error.message).toContain(message);
      expect(error.message).not.toContain(secret);
    }
    const denied = createHandoffBoardAdapter({
      dir: secret,
      readText: () =>
        Promise.reject(Object.assign(new Error(`EACCES ${secret}`), { code: 'EACCES' })),
    });
    await expect(denied.fetch({ now: NOW })).rejects.toThrow(
      'manual:handoff-board.json: could not be read (EACCES)',
    );
    const odd = createHandoffBoardAdapter({ dir: secret, readText: () => Promise.reject('odd') });
    await expect(odd.fetch({ now: NOW })).rejects.toThrow(
      'manual:handoff-board.json: could not be read',
    );
    expect(() =>
      createHandoffBoardAdapter({ dir: ' ', readText: () => Promise.resolve('') }),
    ).not.toThrow();
    await expect(
      createHandoffBoardAdapter({ dir: ' ', readText: () => Promise.resolve('') }).fetch({
        now: NOW,
      }),
    ).rejects.toThrow(RangeError);
  });
});

describe('tracker adapters', () => {
  it.each([
    ['ai-services', aiServices, [['ai-services:svc-1', 'owner_decision']]],
    ['cloud-runs', cloudRuns, [['cloud-runs:run-1', 'blocked_card']]],
  ] as const)(
    '%s reports work items and waiting entries, all manual',
    async (kind, json, expected) => {
      const fs = memoryDir(DIR, { [EXPORT_FILES[kind]]: json });
      const report = await createTrackerAdapter(kind, fs).fetch({ now: NOW });
      const flow = report.sections.flow!;
      const attention = report.sections.attention!;
      if (flow.state !== 'value' || attention.state !== 'value') throw new Error('expected values');
      expect(flow.projects).toEqual([]);
      expect(flow.board.state).toBe('no_data');
      expect(flow.work_items).toHaveLength(json.items.length);
      expect(attention.candidates.map((c) => [c.id, c.kind])).toEqual(expected);
      expect(attention.candidates.every((c) => c.manual === true)).toBe(true);
    },
  );

  it('reports no data when a tracker export is absent', async () => {
    const report = await createTrackerAdapter('cloud-runs', memoryDir(DIR, {})).fetch({ now: NOW });
    expect(report.sections.flow).toMatchObject({
      state: 'no_data',
      reason: 'cloud-runs.json is not in the snapshot directory',
    });
  });

  it('refuses one tracker’s file under the other’s name', async () => {
    const fs = memoryDir(DIR, { 'cloud-runs.json': aiServices });
    await expect(createTrackerAdapter('cloud-runs', fs).fetch({ now: NOW })).rejects.toThrow(
      'export',
    );
  });
});

describe('AI-surfaces spend adapter', () => {
  it('reports every provider, missing readings as no data with their reason', async () => {
    const report = await createAiSurfacesSpendAdapter(
      memoryDir(DIR, { 'ai-surfaces-spend.json': spendSheet }),
    ).fetch({ now: NOW });
    const spend = report.sections.spend!;
    if (spend.state !== 'value') throw new Error('expected a value');
    expect(spend.manual).toBe(true);
    const [a, b, c] = spend.providers;
    expect(a?.quota).toMatchObject({
      state: 'value',
      period_days: 7,
      manual: true,
      as_of: '2026-01-14T11:00:00Z',
    });
    expect(b?.quota).toMatchObject({ state: 'value', as_of: '2026-01-14T10:00:00Z' });
    expect(b?.monthly_cost).toMatchObject({
      state: 'no_data',
      reason: 'the sample sheet has no cost column for this provider',
    });
    expect(c?.quota).toMatchObject({
      state: 'no_data',
      reason: 'the sample provider shows no usage reading',
    });
    expect(c?.monthly_cost).toMatchObject({ state: 'value', usd: 10, cop: 40000, manual: true });
  });

  it('uses default reasons when the sheet gives none', async () => {
    const sheet = { ...spendSheet, providers: [{ id: 'x', label: 'Sample X' }] };
    const report = await createAiSurfacesSpendAdapter(
      memoryDir(DIR, { 'ai-surfaces-spend.json': sheet }),
    ).fetch({ now: NOW });
    const spend = report.sections.spend!;
    if (spend.state !== 'value') throw new Error('expected a value');
    expect(spend.providers[0]?.quota).toMatchObject({
      reason: 'no quota reading in the spend sheet',
    });
    expect(spend.providers[0]?.monthly_cost).toMatchObject({
      reason: 'no cost reading in the spend sheet',
    });
  });

  it('reports no data when the sheet is absent', async () => {
    const report = await createAiSurfacesSpendAdapter(memoryDir(DIR, {})).fetch({ now: NOW });
    expect(report.sections.spend).toMatchObject({
      state: 'no_data',
      reason: 'ai-surfaces-spend.json is not in the snapshot directory',
    });
  });
});

describe('scorecard placeholder', () => {
  it('reports metrics as no data, never a value', async () => {
    const report = await createScorecardPlaceholderAdapter().fetch({ now: NOW });
    expect(report.sections).toEqual({
      metrics: {
        state: 'no_data',
        reason: 'no scorecard source exists yet',
        source: 'scorecard',
        as_of: NOW.toISOString(),
      },
    });
  });
});

describe('every export together', () => {
  it('merges into one valid snapshot whose board and Attention come from the exports', async () => {
    const fs = memoryDir(DIR, {
      'handoff-board.json': handoff,
      'ai-services.json': aiServices,
      'cloud-runs.json': cloudRuns,
      'ai-surfaces-spend.json': spendSheet,
    });
    const { snapshot, failures } = await collectSnapshot(
      [
        createHandoffBoardAdapter(fs),
        createTrackerAdapter('ai-services', fs),
        createTrackerAdapter('cloud-runs', fs),
        createAiSurfacesSpendAdapter(fs),
        createScorecardPlaceholderAdapter(),
      ],
      { now: NOW },
    );
    expect(failures).toEqual([]);
    // The scorecard placeholder is not synthetic, so the merged snapshot is not marked synthetic.
    expect(snapshot.synthetic).toBeUndefined();
    if (snapshot.flow.state !== 'value' || snapshot.attention.state !== 'value') {
      throw new Error('expected values');
    }
    expect(snapshot.flow.board.state).toBe('value');
    expect(snapshot.flow.manual).toBe(true);
    // card-1: value 4 × urgency 4 (six days blocked) = 16; card-2: 3 × 5 (due within a day) = 15.
    expect(rankAttention(snapshot.attention.candidates, NOW).map((c) => c.id)).toEqual([
      'handoff-board:card-1',
      'handoff-board:card-2',
      'ai-services:svc-1',
      'cloud-runs:run-1',
    ]);
    expect(snapshot.metrics.state).toBe('no_data');
  });
});
