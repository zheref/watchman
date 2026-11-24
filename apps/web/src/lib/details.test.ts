import { assertSnapshot, type Snapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import pastReset from '@watchman/core/fixtures/synthetic/past-reset.json';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json';
import { KIND_LABEL, linkDestination, linkHost, waitedLabel } from '@watchman/ui';
import { LINK_HOST_CASES } from '@watchman/ui/testing';
import { describe, expect, it } from 'vitest';
import {
  attentionDetail,
  boardView,
  busiestProjects,
  flowDetail,
  metricsDetail,
  spendDetail,
} from './details';
import * as details from './details';

const fullSnapshot = assertSnapshot(full);
const now = new Date(fullSnapshot.generated_at);

describe('attentionDetail', () => {
  it('ranks every eligible item and counts the pull requests not yet due', () => {
    const detail = attentionDetail(fullSnapshot, now);
    if (detail.state !== 'value') throw new Error('expected attention');
    expect(detail.items).toHaveLength(6);
    expect(detail.items[0]?.id).toBe('orchard-card-7');
    expect(detail.not_yet_due).toBe(1);
    for (const item of detail.items) expect(item.url.startsWith('https://')).toBe(true);
  });

  it('counts a duplicate id once', () => {
    if (fullSnapshot.attention.state !== 'value') throw new Error('fixture');
    const pr = fullSnapshot.attention.candidates.find((c) => c.id === 'lighthouse-pr-3')!;
    const doubled: Snapshot = {
      ...fullSnapshot,
      attention: {
        ...fullSnapshot.attention,
        candidates: [...fullSnapshot.attention.candidates, pr],
      },
    };
    expect(attentionDetail(doubled, now)).toMatchObject({ not_yet_due: 1 });
  });

  it('is no data with its reason when the section is missing', () => {
    expect(attentionDetail(assertSnapshot(empty), now)).toMatchObject({ state: 'no_data' });
  });
});

describe('flowDetail', () => {
  it('lists projects busiest first, stale items and the board', () => {
    const detail = flowDetail(fullSnapshot, now);
    if (detail.state !== 'value') throw new Error('expected flow');
    expect(detail.projects.map((p) => p.project)).toEqual([
      'Project Alpha',
      'Sample Orchard',
      'Demo Lighthouse',
    ]);
    expect(detail.stale).toHaveLength(2);
    expect(detail.summary).toMatchObject({ done_this_week: 3, open_prs: 6 });
    expect(detail.board).toMatchObject({ state: 'value', total: 21 });
  });

  it('is no data when the section is missing', () => {
    expect(flowDetail(assertSnapshot(empty), now)).toMatchObject({ state: 'no_data' });
  });

  it('keeps a missing board as no data and breaks ties by name', () => {
    expect(
      boardView({ state: 'no_data', reason: 'no export', source: 'b', as_of: full.generated_at }),
    ).toMatchObject({ state: 'no_data', reason: 'no export' });
    const stamp = { source: 's', as_of: full.generated_at };
    expect(
      busiestProjects([
        { project: 'b', open_prs: 1, open_issues: 0, ...stamp },
        { project: 'a', open_prs: 0, open_issues: 1, ...stamp },
      ]).map((p) => p.project),
    ).toEqual(['a', 'b']);
  });
});

describe('spendDetail', () => {
  it('gives each provider’s cost or why it has none', () => {
    const detail = spendDetail(fullSnapshot, now);
    if (detail.state !== 'value') throw new Error('expected spend');
    expect(detail.costs.map((c) => c.cost.state)).toEqual(['value', 'no_data', 'value', 'value']);
    expect(detail.costs[0]?.cost).toMatchObject({ usd: '$20.00', cop: 'COP 80,000' });
    expect(detail.costs[2]?.cost).toMatchObject({ stamp: { manual: true } });
  });

  it('labels a reading for another month as no data for this one', () => {
    const snapshot = assertSnapshot(pastReset);
    const detail = spendDetail(snapshot, new Date(snapshot.generated_at));
    if (detail.state !== 'value') throw new Error('expected spend');
    const other = detail.costs.find(
      (c) => c.cost.state === 'no_data' && c.cost.reason.startsWith('latest reading is for'),
    );
    expect(other).toBeDefined();
  });

  it('is no data when the section is missing', () => {
    expect(spendDetail(assertSnapshot(empty), now)).toMatchObject({ state: 'no_data' });
  });
});

describe('metricsDetail', () => {
  it('is no data until a scorecard reports', () => {
    expect(metricsDetail(fullSnapshot)).toMatchObject({
      state: 'no_data',
      reason: 'no scorecard source exists yet',
    });
  });

  it('gives all sixteen cells per project with each reported trend', () => {
    const detail = metricsDetail(assertSnapshot(sparse));
    if (detail.state !== 'value') throw new Error('expected metrics');
    const project = detail.projects.find((p) => p.reported > 0)!;
    expect(project.cells).toHaveLength(16);
    expect(project.reported).toBe(1);
    const reported = project.cells.find((c) => c.trend.state === 'value')!;
    expect(reported.trend).toMatchObject({ state: 'value' });
    expect(project.cells.filter((c) => c.trend.state === 'no_data')).toHaveLength(15);
  });

  it('stamps the view with its oldest and most manual reported series', () => {
    const base = assertSnapshot(sparse);
    if (base.metrics.state !== 'value') throw new Error('fixture');
    const snapshot: Snapshot = {
      ...base,
      metrics: {
        ...base.metrics,
        projects: [
          {
            project: 'Old',
            metrics: {
              Cost: {
                state: 'value',
                source: 'hand-typed',
                as_of: '2026-01-02T00:00:00Z',
                manual: true,
                points: [{ at: '2026-01-02T00:00:00Z', value: 1 }],
              },
            },
          },
        ],
      },
    };
    expect(metricsDetail(snapshot)).toMatchObject({
      stamp: { as_of: '2026-01-02T00:00:00Z', manual: true },
    });
  });

  it('names the direction of a trend', () => {
    const base = assertSnapshot(sparse);
    if (base.metrics.state !== 'value') throw new Error('fixture');
    const at = (d: string) => `2026-01-${d}T00:00:00Z`;
    const series = (values: number[]) => ({
      state: 'value' as const,
      source: 'synthetic',
      as_of: at('13'),
      unit: 'pts',
      points: values.map((value, i) => ({ at: at(String(10 + i)), value })),
    });
    const snapshot: Snapshot = {
      ...base,
      metrics: {
        ...base.metrics,
        projects: [
          {
            project: 'Trend',
            metrics: {
              Accessibility: series([1, 2]),
              Autonomy: series([2, 1]),
              Cost: series([2, 2]),
              Experience: series([5]),
            },
          },
        ],
      },
    };
    const detail = metricsDetail(snapshot);
    if (detail.state !== 'value') throw new Error('expected metrics');
    const directions = detail.projects[0]!.cells.slice(0, 4).map((c) =>
      c.trend.state === 'value' ? c.trend.direction : null,
    );
    expect(directions).toEqual(['up', 'down', 'flat', 'single']);
  });
});

describe('the shared presentation helpers, as the web app prints them', () => {
  it('formats a wait and names every kind in the shared words', () => {
    expect(waitedLabel(30)).toBe('30h');
    expect(waitedLabel(80)).toBe('3d');
    expect(KIND_LABEL.waiting_pr).toBe('Review waiting over 2 days');
  });

  it.each(LINK_HOST_CASES)('linkHost(%j) is %j, the one answer both apps give', (url, host) => {
    expect(linkHost(url)).toBe(host);
  });

  it('names the host of every attention link in the fixture as a browser reads it', () => {
    const detail = attentionDetail(fullSnapshot, now);
    if (detail.state !== 'value') throw new Error('expected attention');
    for (const item of detail.items) {
      expect(linkHost(item.url)).toBe(new URL(item.url).hostname);
      expect(linkDestination(item.url)).toBe(new URL(item.url).hostname);
    }
  });

  it('prints plain words, never an empty host, for a link whose host cannot be read', () => {
    expect(linkDestination('https://bücher.example/a')).toBe('another site');
    expect(linkDestination(' https://example.com/')).toBe('another site');
  });

  it('keeps no copy of its own: the one implementation lives in @watchman/ui', () => {
    for (const name of ['KIND_LABEL', 'waitedLabel', 'linkHost', 'linkDestination']) {
      expect(Object.keys(details)).not.toContain(name);
    }
  });
});
