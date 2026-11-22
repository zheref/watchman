import { describe, expect, it } from 'vitest';
import {
  COLLECTOR_SOURCE,
  collectSnapshot,
  mergeSection,
  type PartialSnapshot,
  type SourceAdapter,
} from '../index';
import { AS_OF, NOW, candidate, workItem } from '../test/builders';

const adapter = (id: string, report: PartialSnapshot | Error): SourceAdapter => ({
  id,
  fetch: () => (report instanceof Error ? Promise.reject(report) : Promise.resolve(report)),
});

const attention = (source: string, as_of: string, ids: string[], manual = false) => ({
  state: 'value' as const,
  source,
  as_of,
  ...(manual ? { manual: true } : {}),
  candidates: ids.map((id) => candidate({ id, source, as_of })),
});

describe('collectSnapshot', () => {
  it('turns every unreported section into labelled no data', async () => {
    const { snapshot, failures } = await collectSnapshot([], { now: NOW });
    expect(failures).toEqual([]);
    expect(snapshot.synthetic).toBeUndefined();
    for (const section of [snapshot.attention, snapshot.flow, snapshot.spend, snapshot.metrics]) {
      expect(section).toMatchObject({ state: 'no_data', source: COLLECTOR_SOURCE });
    }
  });

  it('merges two adapters’ reports of one section, oldest as_of and both sources', async () => {
    const { snapshot } = await collectSnapshot(
      [
        adapter('forge', {
          source: 'forge',
          as_of: AS_OF,
          sections: { attention: attention('forge', AS_OF, ['a', 'shared']) },
        }),
        adapter('board', {
          source: 'board',
          as_of: '2026-01-14T10:00:00Z',
          sections: {
            attention: attention('board', '2026-01-14T10:00:00Z', ['shared', 'b'], true),
          },
        }),
      ],
      { now: NOW },
    );
    expect(snapshot.attention).toMatchObject({
      state: 'value',
      source: 'board + forge',
      as_of: '2026-01-14T10:00:00Z',
      manual: true,
    });
    if (snapshot.attention.state === 'value') {
      expect(snapshot.attention.candidates.map((c) => [c.id, c.source])).toEqual([
        ['a', 'forge'],
        ['shared', 'forge'],
        ['b', 'board'],
      ]);
    }
  });

  it('keeps going when one adapter fails, and says which', async () => {
    const { snapshot, failures } = await collectSnapshot(
      [
        adapter('broken', new Error('token missing')),
        adapter('fixture', {
          source: 'fixture',
          as_of: AS_OF,
          synthetic: true,
          sections: { attention: attention('fixture', AS_OF, ['a']) },
        }),
      ],
      { now: NOW },
    );
    expect(failures).toEqual([{ adapter: 'broken', message: 'token missing' }]);
    expect(snapshot.attention.state).toBe('value');
    expect(snapshot.flow).toMatchObject({
      state: 'no_data',
      reason: 'no source reported flow (failed: broken)',
    });
    // Every figure that made it in came from the synthetic report.
    expect(snapshot.synthetic).toBe(true);
  });

  it('marks the result synthetic only when every report is', async () => {
    const report: PartialSnapshot = { source: 'f', as_of: AS_OF, synthetic: true, sections: {} };
    const { snapshot } = await collectSnapshot([adapter('f', report)], { now: NOW });
    expect(snapshot.synthetic).toBe(true);
  });

  it('records a non-Error rejection as text', async () => {
    const odd: SourceAdapter = { id: 'odd', fetch: () => Promise.reject('nope') };
    const { failures } = await collectSnapshot([odd], { now: NOW });
    expect(failures).toEqual([{ adapter: 'odd', message: 'nope' }]);
  });

  it('refuses two adapters with one id', async () => {
    const report: PartialSnapshot = { source: 'x', as_of: AS_OF, sections: {} };
    await expect(
      collectSnapshot([adapter('x', report), adapter('x', report)], { now: NOW }),
    ).rejects.toThrow('duplicate source adapter id: x');
  });

  it('refuses an adapter report that would not validate', async () => {
    const bad = adapter('bad', {
      source: 'bad',
      as_of: AS_OF,
      sections: { attention: attention('bad', AS_OF, ['a']) },
    });
    // A report stamped later than the collection instant cannot be trusted.
    await expect(collectSnapshot([bad], { now: new Date('2026-01-14T13:00:00Z') })).rejects.toThrow(
      /invalid collected snapshot/,
    );
  });
});

describe('mergeSection', () => {
  const missing = { state: 'no_data' as const, reason: 'r', source: 's', as_of: AS_OF };

  it('returns undefined for no reports and the first no-data when nothing has values', () => {
    expect(mergeSection('flow', [])).toBeUndefined();
    expect(mergeSection('flow', [missing, { ...missing, reason: 'other' }])).toBe(missing);
  });

  it('prefers a report with values over a missing one', () => {
    const value = attention('a', AS_OF, ['x']);
    expect(mergeSection('attention', [missing, value])).toBe(value);
  });

  it('merges flow lists and keeps the first board with values', () => {
    const board = {
      state: 'value' as const,
      source: 'b',
      as_of: AS_OF,
      columns: [{ name: 'Done', count: 1 }],
    };
    const flow = (source: string, board: unknown, project: string, item: string) => ({
      state: 'value' as const,
      source,
      as_of: AS_OF,
      projects: [{ project, open_prs: 1, open_issues: 1, source, as_of: AS_OF }],
      work_items: [workItem({ id: item, source })],
      board: board as typeof missing,
    });
    const merged = mergeSection('flow', [
      flow('a', missing, 'Project Alpha', 'w1'),
      flow('b', board, 'Sample Orchard', 'w1'),
    ]);
    expect(merged).toMatchObject({ source: 'a + b', board });
    if (merged?.state === 'value') {
      expect(merged.projects).toHaveLength(2);
      expect(merged.work_items).toHaveLength(1);
    }
  });

  it('merges spend providers and metrics projects by id', () => {
    const spend = (source: string, id: string) => ({
      state: 'value' as const,
      source,
      as_of: AS_OF,
      providers: [{ id, label: id, quota: missing, monthly_cost: missing }],
    });
    const merged = mergeSection('spend', [spend('a', 'p1'), spend('b', 'p1'), spend('c', 'p2')]);
    expect(merged?.state === 'value' && merged.providers.map((p) => p.id)).toEqual(['p1', 'p2']);

    const metrics = (source: string, project: string) => ({
      state: 'value' as const,
      source,
      as_of: AS_OF,
      projects: [{ project, metrics: {} }],
    });
    const mergedMetrics = mergeSection('metrics', [metrics('a', 'P'), metrics('b', 'Q')]);
    expect(mergedMetrics?.state === 'value' && mergedMetrics.projects).toHaveLength(2);
  });
});
