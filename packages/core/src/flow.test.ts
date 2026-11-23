import { describe, expect, it } from 'vitest';
import fullFixture from '../fixtures/synthetic/full.json';
import { assertSnapshot, flowTotals, staleItems, throughput, weekBounds } from './index';
import { NOW, workItem } from './test/builders';

describe('weekBounds', () => {
  it('starts the week on Monday 00:00 UTC by default', () => {
    // 2026-01-14 is a Wednesday.
    const { this_week_start, last_week_start } = weekBounds(NOW);
    expect(this_week_start.toISOString()).toBe('2026-01-12T00:00:00.000Z');
    expect(last_week_start.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  it('follows the owner’s offset and chosen first day', () => {
    const local = weekBounds(new Date('2026-01-12T03:00:00Z'), { utcOffsetMinutes: -300 });
    // 03:00 UTC on Monday is still Sunday evening at UTC-5, so the week began the Monday before.
    expect(local.this_week_start.toISOString()).toBe('2026-01-05T05:00:00.000Z');
    const sunday = weekBounds(NOW, { weekStartsOn: 0 });
    expect(sunday.this_week_start.toISOString()).toBe('2026-01-11T00:00:00.000Z');
  });

  it('refuses a day outside 0..6', () => {
    expect(() => weekBounds(NOW, { weekStartsOn: 7 })).toThrow(RangeError);
  });
});

describe('throughput', () => {
  it('compares this week with last on the fixture', () => {
    const snapshot = assertSnapshot(fullFixture);
    if (snapshot.flow.state !== 'value') throw new Error('fixture flow missing');
    expect(throughput(snapshot.flow.work_items, NOW)).toEqual({
      this_week: 3,
      last_week: 2,
      delta: 1,
      trend: 'up',
    });
  });

  it('ignores open items, items completed after now and items older than last week', () => {
    const items = [
      workItem({ id: 'open' }),
      workItem({ id: 'future', completed_at: '2026-01-15T00:00:00Z' }),
      workItem({ id: 'old', completed_at: '2026-01-01T00:00:00Z' }),
      workItem({ id: 'edge', completed_at: '2026-01-12T00:00:00Z' }),
      workItem({ id: 'last', completed_at: '2026-01-11T23:59:59Z' }),
    ];
    expect(throughput(items, NOW)).toEqual({ this_week: 1, last_week: 1, delta: 0, trend: 'flat' });
  });

  it('reports a fall as down', () => {
    expect(throughput([workItem({ completed_at: '2026-01-06T00:00:00Z' })], NOW).trend).toBe(
      'down',
    );
  });
});

describe('staleItems', () => {
  it('lists open items idle for more than three days, most idle first', () => {
    const items = [
      workItem({ id: 'fresh', updated_at: '2026-01-13T00:00:00Z' }),
      workItem({ id: 'exactly-3d', updated_at: '2026-01-11T15:00:00Z' }),
      workItem({ id: 'b', updated_at: '2026-01-05T00:00:00Z' }),
      workItem({ id: 'a', updated_at: '2026-01-05T00:00:00Z' }),
      workItem({ id: 'older', updated_at: '2026-01-01T00:00:00Z' }),
      workItem({
        id: 'done',
        updated_at: '2026-01-01T00:00:00Z',
        completed_at: '2026-01-02T00:00:00Z',
      }),
    ];
    const stale = staleItems(items, NOW);
    expect(stale.map((s) => s.id)).toEqual(['older', 'a', 'b']);
    expect(stale[0]?.idle_days).toBe(13);
  });

  it('takes another threshold and refuses a negative one', () => {
    expect(staleItems([workItem({ updated_at: '2026-01-13T00:00:00Z' })], NOW, 1)).toHaveLength(1);
    expect(() => staleItems([], NOW, -1)).toThrow(RangeError);
  });
});

describe('flowTotals', () => {
  it('sums open work across projects', () => {
    const snapshot = assertSnapshot(fullFixture);
    if (snapshot.flow.state !== 'value') throw new Error('fixture flow missing');
    expect(flowTotals(snapshot.flow.projects)).toEqual({
      open_prs: 6,
      open_issues: 19,
      projects: 3,
    });
    expect(flowTotals([])).toEqual({ open_prs: 0, open_issues: 0, projects: 0 });
  });
});
