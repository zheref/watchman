import { assertSnapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import manualOnly from '@watchman/core/fixtures/synthetic/manual-only.json';
import mixed from '@watchman/core/fixtures/synthetic/mixed-as-of.json';
import pastReset from '@watchman/core/fixtures/synthetic/past-reset.json';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json';
import { describe, expect, it } from 'vitest';
import { attentionView, flowView, metricsView, plural, spendView } from './tiles';

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
      done_this_week: 3,
      done_last_week: 2,
      delta: 1,
      stale: 2,
      stale_after_days: 3,
      open_prs: 6,
      open_issues: 19,
    });
  });

  it('totals spend and keeps per-provider quota state', () => {
    const view = spendView(fullSnapshot, now);
    expect(view).toMatchObject({
      state: 'value',
      month: '2026-01',
      total: {
        usd: '$60.00',
        cop: 'COP 240,000',
        partial: true,
        missing: 1,
        // The total includes a hand-typed reading from the day before: its stamp says both.
        stamp: { as_of: '2026-01-13T12:00:00Z', manual: true },
      },
      stamp: { as_of: '2026-01-13T12:00:00Z', manual: true },
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

describe('stamps and boundaries', () => {
  it('stamps combined figures with their oldest contributor, not the section', () => {
    const snapshot = assertSnapshot(mixed);
    expect(flowView(snapshot, now)).toMatchObject({
      stamp: {
        as_of: '2026-01-11T08:00:00Z',
        source: 'synthetic + synthetic-forge + synthetic-tracker',
      },
    });
    expect(attentionView(snapshot, now)).toMatchObject({
      stamp: { as_of: '2026-01-12T09:00:00Z' },
    });
    expect(spendView(snapshot, now)).toMatchObject({ stamp: { as_of: '2026-01-10T08:00:00Z' } });
  });

  it('counts a quiet week, rolls a passed reset forward and keeps an over-quota reading', () => {
    const snapshot = assertSnapshot(pastReset);
    expect(flowView(snapshot, now)).toMatchObject({
      done_this_week: 0,
      done_last_week: 1,
      delta: -1,
      stale: 0,
      open_prs: 0,
    });
    const spend = spendView(snapshot, now);
    expect(spend).toMatchObject({ state: 'value', total: null });
    if (spend.state === 'value') {
      expect(spend.providers[0]?.quota).toMatchObject({
        percent: 120,
        exceeded: true,
        resets_at: '2026-01-21T00:00:00.000Z',
      });
      expect(spend.providers[1]?.quota).toMatchObject({ resets_at: '2026-01-31T00:00:00.000Z' });
    }
  });

  it('marks every view of a hand-typed snapshot manual', () => {
    const snapshot = assertSnapshot(manualOnly);
    for (const view of [
      attentionView(snapshot, now),
      flowView(snapshot, now),
      spendView(snapshot, now),
      metricsView(snapshot, 'Project Alpha'),
    ]) {
      expect(view).toMatchObject({ state: 'value', stamp: { manual: true } });
    }
  });

  it('follows the owner’s offset across a week boundary', () => {
    // At Monday 10:00 UTC an item done at Monday 03:00 UTC is this week in UTC, but at UTC-5 it
    // was done on Sunday 22:00 local, so it belongs to last week.
    const monday = new Date('2026-01-12T10:00:00Z');
    const snapshot = assertSnapshot({
      ...mixed,
      generated_at: '2026-01-14T15:00:00Z',
    });
    if (snapshot.flow.state !== 'value') throw new Error('fixture flow missing');
    const item = { ...snapshot.flow.work_items[0]!, completed_at: '2026-01-12T03:00:00Z' };
    const shifted = { ...snapshot, flow: { ...snapshot.flow, work_items: [item] } };
    expect(flowView(shifted, monday)).toMatchObject({ done_this_week: 1, done_last_week: 0 });
    expect(flowView(shifted, monday, { utcOffsetMinutes: -300 })).toMatchObject({
      done_this_week: 0,
      done_last_week: 1,
    });
  });

  it('reads a project with no reported metric as no data, not 0 of 16', () => {
    expect(metricsView(assertSnapshot(sparse), 'Sample Orchard')).toMatchObject({
      state: 'no_data',
      reason: 'no metrics reported for Sample Orchard',
    });
  });

  it('pluralises', () => {
    expect(plural(1, 'provider')).toBe('1 provider');
    expect(plural(2, 'provider')).toBe('2 providers');
    expect(plural(0, 'open PR')).toBe('0 open PRs');
  });
});
