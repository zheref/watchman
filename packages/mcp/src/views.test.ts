import { assertSnapshot, type Snapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json' with { type: 'json' };
import full from '@watchman/core/fixtures/synthetic/full.json' with { type: 'json' };
import sparse from '@watchman/core/fixtures/synthetic/sparse.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import {
  attentionOutputSchema,
  flowOutputSchema,
  metricsOutputSchema,
  spendOutputSchema,
} from './schemas';
import type { LoadedSnapshot } from './snapshot';
import { attentionView, flowView, metricsView, spendView } from './views';

const NOW = new Date('2026-01-14T15:00:00Z');

const loaded = (
  json: unknown,
  overrides: Partial<Omit<LoadedSnapshot, 'snapshot'>> = {},
): LoadedSnapshot => ({
  snapshot: assertSnapshot(json),
  origin: 'synthetic-fixture',
  file: 'synthetic fixture',
  skipped: [],
  ...overrides,
});

const FULL = loaded(full);
const SPARSE = loaded(sparse, { origin: 'file', file: 'file:snapshot-x.json' });
const EMPTY = loaded(empty);

/** A copy of full.json that is not marked synthetic, read from a file. */
const REAL_LOOKING = loaded({ ...full, synthetic: undefined } as unknown, {
  origin: 'file',
  file: 'file:snapshot-2026-01-14T15-00-00Z.json',
  skipped: [{ source: 'file:snapshot-2026-01-14T16-00-00Z.json', problem: 'not valid JSON' }],
});

function withSources(sources: Snapshot['sources']): LoadedSnapshot {
  return loaded({ ...full, sources } as unknown);
}

describe('the envelope', () => {
  it('carries source, as_of, the synthetic flag, the snapshot and the filter', () => {
    const out = attentionView(
      FULL,
      { project: 'Project Alpha', since: '2026-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(out).toMatchObject({
      source: 'synthetic',
      as_of: '2026-01-14T14:30:00Z',
      synthetic: true,
      evaluated_at: NOW.toISOString(),
      snapshot: { origin: 'synthetic-fixture', generated_at: '2026-01-14T15:00:00Z' },
      filter: { project: 'Project Alpha', since: '2026-01-01T00:00:00.000Z' },
    });
    expect(out).not.toHaveProperty('gaps');
    expect(out.snapshot).not.toHaveProperty('skipped');
  });

  it('is not synthetic for an unmarked file, and lists skipped files', () => {
    const out = flowView(REAL_LOOKING, {}, NOW);
    expect(out.synthetic).toBe(false);
    expect(out.snapshot.skipped).toEqual(REAL_LOOKING.skipped);
    expect(out.filter).toEqual({});
  });

  it('names the sources that failed or had no data for the section', () => {
    const out = flowView(
      withSources([
        { adapter: 'forge', status: 'failed', feeds: ['flow', 'attention'], reason: 'timed out' },
        { adapter: 'board', status: 'no_data', feeds: ['flow'] },
        { adapter: 'billing', status: 'failed', feeds: ['spend'] },
        { adapter: 'ok', status: 'value', feeds: ['flow'] },
      ]),
      {},
      NOW,
    );
    expect(out.gaps).toEqual([
      { adapter: 'forge', status: 'failed', reason: 'timed out' },
      { adapter: 'board', status: 'no_data' },
    ]);
  });
});

describe('every view on a snapshot with no data', () => {
  it.each([
    ['attention', attentionView, attentionOutputSchema],
    ['flow', flowView, flowOutputSchema],
    ['spend', spendView, spendOutputSchema],
    ['metrics', metricsView, metricsOutputSchema],
  ] as const)('%s is an explicit no_data record', (key, view, schema) => {
    const out = view(EMPTY, {}, NOW) as unknown as Record<
      string,
      { state: string; reason: string }
    >;
    expect(out[key]).toMatchObject({ state: 'no_data', reason: expect.any(String) });
    expect(schema.safeParse(out).success).toBe(true);
  });
});

describe('attentionView', () => {
  it('ranks the top five by default and counts every eligible item', () => {
    const out = attentionView(FULL, {}, NOW);
    expect(attentionOutputSchema.parse(out)).toEqual(out);
    if (out.attention.state !== 'value') throw new Error('expected a value');
    expect(out.attention.items).toHaveLength(5);
    expect(out.attention.total).toBeGreaterThan(5);
    const scores = out.attention.items.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('keeps a due date, honours the limit and counts PRs not yet due', () => {
    const out = attentionView(FULL, { project: 'demo lighthouse' }, NOW, 10);
    if (out.attention.state !== 'value') throw new Error('expected a value');
    expect(out.attention.items.map((i) => i.id)).toEqual(['lighthouse-decision-2']);
    expect(out.attention.items[0]!.due_at).toBe('2026-01-14T20:00:00Z');
    expect(out.attention.not_yet_due).toBe(1);
    expect(attentionView(FULL, {}, NOW, 1).attention).toMatchObject({ items: [expect.anything()] });
  });

  it('keeps only items waiting since the bound', () => {
    const out = attentionView(FULL, { since: '2026-01-13T00:00:00.000Z' }, NOW, 50);
    if (out.attention.state !== 'value') throw new Error('expected a value');
    expect(out.attention.items.length).toBeGreaterThan(0);
    for (const item of out.attention.items) {
      expect(Date.parse(item.waiting_since)).toBeGreaterThanOrEqual(
        Date.parse('2026-01-13T00:00:00Z'),
      );
    }
  });

  it('answers an empty list for an unknown project', () => {
    expect(attentionView(FULL, { project: 'Nope' }, NOW).attention).toMatchObject({
      state: 'value',
      total: 0,
      items: [],
    });
  });

  it('labels a manual item', () => {
    const json = structuredClone(full) as typeof full;
    (json.attention.candidates[0] as Record<string, unknown>).manual = true;
    const out = attentionView(loaded(json), {}, NOW, 50);
    if (out.attention.state !== 'value') throw new Error('expected a value');
    const item = out.attention.items.find((i) => i.id === json.attention.candidates[0]!.id);
    expect(item?.manual).toBe(true);
    expect(out.attention.items.filter((i) => i.manual === true)).toHaveLength(1);
  });
});

describe('flowView', () => {
  it('reports totals, throughput, stale items and the board', () => {
    const out = flowView(FULL, {}, NOW);
    expect(flowOutputSchema.parse(out)).toEqual(out);
    if (out.flow.state !== 'value') throw new Error('expected a value');
    expect(out.flow.totals).toEqual({ open_prs: 6, open_issues: 19, projects: 3 });
    expect(out.flow.board.state).toBe('value');
    expect(out.flow).not.toHaveProperty('window');
    expect(out.flow.stale.length).toBeGreaterThan(0);
  });

  it('narrows to one project, and does not split the board by project', () => {
    const out = flowView(FULL, { project: 'PROJECT ALPHA' }, NOW);
    if (out.flow.state !== 'value') throw new Error('expected a value');
    expect(out.flow.projects.map((p) => p.project)).toEqual(['Project Alpha']);
    expect(out.flow.stale.every((s) => s.project === 'Project Alpha')).toBe(true);
    expect(out.flow.board).toMatchObject({
      state: 'no_data',
      reason: expect.stringMatching(/project/),
    });
  });

  it('with a time bound, counts opened and completed items and narrows the stale list', () => {
    const all = flowView(FULL, {}, NOW);
    const out = flowView(FULL, { since: '2026-01-10T00:00:00.000Z' }, NOW);
    if (out.flow.state !== 'value' || all.flow.state !== 'value')
      throw new Error('expected values');
    expect(out.flow.window).toEqual({
      since: '2026-01-10T00:00:00.000Z',
      opened: expect.any(Number),
      completed: expect.any(Number),
    });
    expect(out.flow.stale.length).toBeLessThan(all.flow.stale.length);
    expect(out.flow.throughput).toEqual(all.flow.throughput);
  });

  it('passes a no_data board through', () => {
    const json = structuredClone(full) as typeof full;
    (json.flow as Record<string, unknown>).board = {
      state: 'no_data',
      reason: 'board offline',
      source: 'synthetic-board',
      as_of: '2026-01-14T14:30:00Z',
    };
    const out = flowView(loaded(json), {}, NOW);
    if (out.flow.state !== 'value') throw new Error('expected a value');
    expect(out.flow.board).toMatchObject({ state: 'no_data', reason: 'board offline' });
  });
});

describe('spendView', () => {
  it('reports quotas with countdowns and a partial monthly total', () => {
    const out = spendView(FULL, {}, NOW);
    expect(spendOutputSchema.parse(out)).toEqual(out);
    if (out.spend.state !== 'value') throw new Error('expected a value');
    expect(out.spend.month).toBe('2026-01');
    expect(out.spend.total).toMatchObject({ state: 'value', partial: true, manual: true });
    const a = out.spend.providers.find((p) => p.id === 'sample-a')!;
    expect(a.quota).toMatchObject({ state: 'value', percent: 40, resets_in: '4d 9h' });
    const c = out.spend.providers.find((p) => p.id === 'sample-c')!;
    expect(c.monthly_cost).toMatchObject({ state: 'value', manual: true });
  });

  it('answers no_data for a project, because spend is per provider', () => {
    expect(spendView(FULL, { project: 'Project Alpha' }, NOW).spend).toMatchObject({
      state: 'no_data',
      reason: 'spend is reported per provider, not per project',
    });
  });

  it('turns readings older than the bound into no_data and leaves them out of the total', () => {
    const out = spendView(FULL, { since: '2026-01-14T14:30:00.000Z' }, NOW);
    if (out.spend.state !== 'value') throw new Error('expected a value');
    for (const p of out.spend.providers) {
      expect(p.quota.state).toBe('no_data');
      expect(p.monthly_cost.state).toBe('no_data');
    }
    expect(out.spend.providers[0]!.quota).toMatchObject({
      reason: expect.stringMatching(/is older than/),
    });
    expect(out.spend.total).toMatchObject({ state: 'no_data' });
  });
});

describe('metricsView', () => {
  it('reports all sixteen metrics per project, values and no_data', () => {
    const out = metricsView(SPARSE, {}, NOW);
    expect(metricsOutputSchema.parse(out)).toEqual(out);
    if (out.metrics.state !== 'value') throw new Error('expected a value');
    const cells = out.metrics.projects[0]!.metrics;
    expect(cells).toHaveLength(16);
    const values = cells.filter((c) => c.state === 'value');
    expect(values.map((c) => c.name)).toEqual(['Visibility']);
    expect(cells.find((c) => c.name === 'Efficiency')).toMatchObject({
      state: 'no_data',
      reason: 'not scored this week',
    });
    expect(cells.find((c) => c.name === 'Security')).toMatchObject({
      reason: 'Security not reported for Project Alpha',
    });
  });

  it('finds a project by any case, and answers sixteen no_data cells for an unknown one', () => {
    if (SPARSE.snapshot.metrics.state !== 'value') throw new Error('expected a value');
    const name = SPARSE.snapshot.metrics.projects[0]!.project;
    const known = metricsView(SPARSE, { project: name.toUpperCase() }, NOW);
    if (known.metrics.state !== 'value') throw new Error('expected a value');
    expect(known.metrics.projects.map((p) => p.project)).toEqual([name]);
    const unknown = metricsView(SPARSE, { project: 'Nope' }, NOW);
    if (unknown.metrics.state !== 'value') throw new Error('expected a value');
    expect(unknown.metrics.projects).toHaveLength(1);
    expect(unknown.metrics.projects[0]!.metrics.every((c) => c.state === 'no_data')).toBe(true);
  });

  it('keeps only points since the bound, and a metric with none left is no_data', () => {
    const out = metricsView(SPARSE, { since: '2099-01-01T00:00:00.000Z' }, NOW);
    if (out.metrics.state !== 'value') throw new Error('expected a value');
    const cells = out.metrics.projects[0]!.metrics;
    expect(cells.every((c) => c.state === 'no_data')).toBe(true);
    expect(cells.find((c) => c.name === 'Visibility')).toMatchObject({
      reason: 'no Visibility points at or after 2099-01-01T00:00:00.000Z',
    });
  });

  it('computes the trend from the points kept', () => {
    if (SPARSE.snapshot.metrics.state !== 'value') throw new Error('expected a value');
    const series = SPARSE.snapshot.metrics.projects[0]!.metrics.Visibility!;
    if (series.state !== 'value') throw new Error('expected a value');
    const sorted = [...series.points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const last = sorted[sorted.length - 1]!;
    const out = metricsView(SPARSE, { since: last.at }, NOW);
    if (out.metrics.state !== 'value') throw new Error('expected a value');
    expect(out.metrics.projects[0]!.metrics.find((c) => c.name === 'Visibility')).toMatchObject({
      state: 'value',
      latest: last.value,
      previous: null,
      delta: null,
      points: [last],
    });
  });
});
