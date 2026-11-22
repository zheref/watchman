import { assertSnapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json';
import { describe, expect, it } from 'vitest';
import { attentionView, flowView, metricsView, spendView } from './tiles';

const fullSnapshot = assertSnapshot(full);
const now = new Date(fullSnapshot.generated_at);

describe('tile views from the full synthetic fixture', () => {
  it('ranks the top five attention items', () => {
    const view = attentionView(fullSnapshot, now);
    expect(view.state === 'value' && view.items.map((i) => i.id)[0]).toBe('orchard-card-7');
    expect(view.state === 'value' && view.items).toHaveLength(5);
  });

  it('summarises flow', () => {
    expect(flowView(fullSnapshot, now)).toMatchObject({
      state: 'value',
      merged_this_week: 3,
      merged_last_week: 2,
      delta: 1,
      stale: 2,
      open_prs: 6,
      open_issues: 19,
    });
  });

  it('totals spend and keeps per-provider quota state', () => {
    const view = spendView(fullSnapshot, now);
    expect(view).toMatchObject({
      state: 'value',
      month: '2026-01',
      total: { usd: '$60.00', cop: 'COP 240,000', partial: true, missing: 1, manual: true },
    });
    if (view.state === 'value') {
      expect(view.providers.map((p) => p.quota.state)).toEqual([
        'value',
        'value',
        'no_data',
        'value',
      ]);
    }
  });

  it('keeps metrics as no data', () => {
    expect(metricsView(fullSnapshot, 'Project Alpha')).toMatchObject({
      state: 'no_data',
      reason: 'no scorecard source exists yet',
    });
  });
});

describe('tile views from sparse and empty fixtures', () => {
  it('labels every missing section with its reason and stamp', () => {
    const snapshot = assertSnapshot(empty);
    for (const view of [
      attentionView(snapshot, now),
      flowView(snapshot, now),
      spendView(snapshot, now),
      metricsView(snapshot, 'Project Alpha'),
    ]) {
      expect(view).toMatchObject({ state: 'no_data', stamp: { source: 'synthetic' } });
    }
  });

  it('carries the manual label, a null total and a metrics count', () => {
    const snapshot = assertSnapshot(sparse);
    expect(attentionView(snapshot, now)).toMatchObject({ stamp: { manual: true } });
    expect(spendView(snapshot, now)).toMatchObject({ state: 'value', total: null });
    expect(metricsView(snapshot, 'Project Alpha')).toMatchObject({ reported: 1, total: 16 });
  });
});
