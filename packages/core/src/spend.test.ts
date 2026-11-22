import { describe, expect, it } from 'vitest';
import fullFixture from '../fixtures/synthetic/full.json';
import {
  assertSnapshot,
  formatMoney,
  monthOf,
  monthlySpendTotal,
  nextReset,
  quotaStatus,
  type ProviderSpend,
  type Quota,
} from './index';
import { AS_OF, NOW } from './test/builders';

const quota = (overrides: Partial<Extract<Quota, { state: 'value' }>> = {}): Quota => ({
  state: 'value',
  used: 40,
  limit: 100,
  unit: 'percent',
  resets_at: '2026-01-19T00:00:00Z',
  period_days: 7,
  source: 'synthetic',
  as_of: AS_OF,
  ...overrides,
});

describe('nextReset', () => {
  it('keeps a reset that is still ahead', () => {
    expect(nextReset('2026-01-19T00:00:00Z', NOW, 7).toISOString()).toBe(
      '2026-01-19T00:00:00.000Z',
    );
  });

  it('rolls a passed reset forward by whole periods', () => {
    expect(nextReset('2026-01-13T00:00:00Z', NOW, 7).toISOString()).toBe(
      '2026-01-20T00:00:00.000Z',
    );
    expect(nextReset('2025-12-30T00:00:00Z', NOW, 7).toISOString()).toBe(
      '2026-01-20T00:00:00.000Z',
    );
    expect(nextReset(NOW.toISOString(), NOW, 1).toISOString()).toBe('2026-01-15T15:00:00.000Z');
  });

  it('refuses a non-positive period', () => {
    expect(() => nextReset(AS_OF, NOW, 0)).toThrow(RangeError);
  });
});

describe('quotaStatus', () => {
  it('reports usage against the limit and the countdown to reset', () => {
    expect(quotaStatus(quota(), NOW)).toMatchObject({
      state: 'value',
      fraction: 0.4,
      percent: 40,
      remaining: 60,
      exceeded: false,
      resets_at: '2026-01-19T00:00:00.000Z',
      countdown: { label: '4d 9h' },
      manual: false,
    });
  });

  it('marks an exceeded quota without clamping it', () => {
    expect(quotaStatus(quota({ used: 120, manual: true }), NOW)).toMatchObject({
      percent: 120,
      remaining: 0,
      exceeded: true,
      manual: true,
    });
  });

  it('passes a missing reading through as no data', () => {
    const missing = { state: 'no_data', reason: 'no API', source: 's', as_of: AS_OF } as const;
    expect(quotaStatus(missing, NOW)).toBe(missing);
  });
});

describe('monthlySpendTotal', () => {
  it('sums the fixture’s known costs and lists the provider it could not include', () => {
    const snapshot = assertSnapshot(fullFixture);
    if (snapshot.spend.state !== 'value') throw new Error('fixture spend missing');
    expect(monthlySpendTotal(snapshot.spend.providers, '2026-01', AS_OF)).toEqual({
      state: 'value',
      month: '2026-01',
      usd: 60,
      cop: 240000,
      included: ['sample-a', 'sample-c', 'sample-d'],
      missing: ['sample-b'],
      partial: true,
      manual: true,
      as_of: '2026-01-13T12:00:00Z',
      source: 'manual entry + synthetic-billing',
    });
  });

  it('treats a reading for another month as missing, and nothing known as no data', () => {
    const provider: ProviderSpend = {
      id: 'p',
      label: 'Sample',
      quota: { state: 'no_data', reason: 'none', source: 's', as_of: AS_OF },
      monthly_cost: {
        state: 'value',
        month: '2025-12',
        usd: 5,
        cop: 20000,
        source: 's',
        as_of: AS_OF,
      },
    };
    expect(monthlySpendTotal([provider], '2026-01', AS_OF)).toMatchObject({
      state: 'no_data',
      source: 'watchman',
    });
    expect(monthlySpendTotal([provider], '2025-12', AS_OF)).toMatchObject({
      usd: 5,
      partial: false,
      manual: false,
    });
  });
});

describe('formatting', () => {
  it('formats USD and COP with fixed grouping', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(80000, 'COP')).toBe('COP 80,000');
  });

  it('names the month in UTC', () => {
    expect(monthOf(NOW)).toBe('2026-01');
    expect(monthOf(new Date('2026-11-30T23:00:00Z'))).toBe('2026-11');
  });
});
