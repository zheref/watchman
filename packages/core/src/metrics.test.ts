import { describe, expect, it } from 'vitest';
import fullFixture from '../fixtures/synthetic/full.json';
import sparseFixture from '../fixtures/synthetic/sparse.json';
import { METRIC_NAMES, assertSnapshot, metricCells, metricTrend } from './index';

describe('METRIC_NAMES', () => {
  it('lists the sixteen merge-priority metrics once each', () => {
    expect(METRIC_NAMES).toHaveLength(16);
    expect(new Set(METRIC_NAMES).size).toBe(16);
  });
});

describe('metricCells', () => {
  it('reads every metric as no data while no scorecard exists', () => {
    const { metrics } = assertSnapshot(fullFixture);
    const cells = metricCells(metrics, 'Project Alpha');
    expect(cells.map((c) => c.name)).toEqual([...METRIC_NAMES]);
    expect(cells.every((c) => c.series.state === 'no_data')).toBe(true);
  });

  it('fills unreported metrics and unknown projects with labelled no data', () => {
    const { metrics } = assertSnapshot(sparseFixture);
    const cells = metricCells(metrics, 'Project Alpha');
    const byName = Object.fromEntries(cells.map((c) => [c.name, c.series]));
    expect(byName.Visibility?.state).toBe('value');
    expect(byName.Efficiency).toMatchObject({ state: 'no_data', reason: 'not scored this week' });
    expect(byName.Security).toMatchObject({
      state: 'no_data',
      reason: 'Security not reported for Project Alpha',
    });
    const unknown = metricCells(metrics, 'Sample Orchard');
    expect(unknown[0]?.series).toMatchObject({ reason: 'no metrics reported for Sample Orchard' });
  });
});

describe('metricTrend', () => {
  it('gives the latest point and its change, whatever the point order', () => {
    expect(
      metricTrend({
        state: 'value',
        source: 's',
        as_of: '2026-01-14T12:00:00Z',
        points: [
          { at: '2026-01-14T12:00:00Z', value: 70 },
          { at: '2026-01-07T12:00:00Z', value: 60 },
        ],
      }),
    ).toEqual({ latest: 70, previous: 60, delta: 10, latest_at: '2026-01-14T12:00:00Z' });
  });

  it('has no change for a single point and passes no data through', () => {
    expect(
      metricTrend({
        state: 'value',
        source: 's',
        as_of: '2026-01-14T12:00:00Z',
        points: [{ at: '2026-01-14T12:00:00Z', value: 1 }],
      }),
    ).toMatchObject({ previous: null, delta: null });
    const missing = { state: 'no_data', reason: 'r', source: 's', as_of: '2026-01-14T12:00:00Z' };
    expect(metricTrend(missing as never)).toBe(missing);
  });
});
