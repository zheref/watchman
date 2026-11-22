import { noData, type NoData } from './provenance';
import type { ProviderSpend, Quota } from './snapshot';
import { countdown, DAY_MS, toMillis, type Countdown } from './time';

/**
 * Spend: how much of each provider's quota is used before its reset, and what the month costs.
 * Missing readings stay missing: a provider with no quota reading is `no_data`, and a total over
 * providers says which ones it could not include.
 */

/**
 * The next reset strictly after `now`. A reported `resets_at` that has already passed (a stale
 * reading) is rolled forward by whole periods, because quotas reset on a fixed cadence.
 */
export function nextReset(resetsAt: string, now: Date, periodDays: number): Date {
  if (!(periodDays > 0)) throw new RangeError(`periodDays must be positive, got ${periodDays}`);
  const period = periodDays * DAY_MS;
  let at = toMillis(resetsAt);
  const current = now.getTime();
  if (at <= current) at += Math.floor((current - at) / period + 1) * period;
  return new Date(at);
}

export interface QuotaStatus {
  state: 'value';
  used: number;
  limit: number;
  unit: string;
  /** `used / limit`, not clamped: above 1 means the quota is exceeded. */
  fraction: number;
  /** `fraction` as a whole percentage, for display. */
  percent: number;
  remaining: number;
  exceeded: boolean;
  resets_at: string;
  countdown: Countdown;
  source: string;
  as_of: string;
  manual: boolean;
}

/** A quota reading at `now`: usage against the limit and the countdown to the next reset. */
export function quotaStatus(quota: Quota, now: Date): QuotaStatus | NoData {
  if (quota.state === 'no_data') return quota;
  const reset = nextReset(quota.resets_at, now, quota.period_days);
  const fraction = quota.used / quota.limit;
  return {
    state: 'value',
    used: quota.used,
    limit: quota.limit,
    unit: quota.unit,
    fraction,
    percent: Math.round(fraction * 100),
    remaining: Math.max(0, quota.limit - quota.used),
    exceeded: quota.used > quota.limit,
    resets_at: reset.toISOString(),
    countdown: countdown(reset.toISOString(), now),
    source: quota.source,
    as_of: quota.as_of,
    manual: quota.manual === true,
  };
}

export interface MonthlyTotal {
  state: 'value';
  month: string;
  usd: number;
  cop: number;
  /** Provider ids whose cost is in the total. */
  included: string[];
  /** Provider ids with no cost reading for the month; a non-empty list makes the total partial. */
  missing: string[];
  partial: boolean;
  /** True when any included reading was entered by hand. */
  manual: boolean;
  /** The oldest `as_of` among the included readings. */
  as_of: string;
  source: string;
}

/**
 * Sums each provider's monthly cost for `month`. Providers with no reading, or a reading for a
 * different month, are listed in `missing` rather than counted as zero. When nothing at all is
 * known the result is `no_data`.
 */
export function monthlySpendTotal(
  providers: readonly ProviderSpend[],
  month: string,
  asOf: string,
): MonthlyTotal | NoData {
  const included: string[] = [];
  const missing: string[] = [];
  const sources = new Set<string>();
  let usd = 0;
  let cop = 0;
  let manual = false;
  let oldest: string | undefined;
  for (const provider of providers) {
    const cost = provider.monthly_cost;
    if (cost.state !== 'value' || cost.month !== month) {
      missing.push(provider.id);
      continue;
    }
    included.push(provider.id);
    usd += cost.usd;
    cop += cost.cop;
    manual ||= cost.manual === true;
    sources.add(cost.source);
    if (oldest === undefined || toMillis(cost.as_of) < toMillis(oldest)) oldest = cost.as_of;
  }
  if (oldest === undefined) {
    return noData(`no provider reported a cost for ${month}`, 'watchman', asOf);
  }
  return {
    state: 'value',
    month,
    usd: Math.round(usd * 100) / 100,
    cop: Math.round(cop),
    included,
    missing,
    partial: missing.length > 0,
    manual,
    as_of: oldest,
    source: [...sources].sort().join(' + '),
  };
}

/** `YYYY-MM` of `now` in the owner's calendar: UTC shifted by `utcOffsetMinutes` (0 by default). */
export function monthOf(now: Date, utcOffsetMinutes = 0): string {
  const local = new Date(now.getTime() + utcOffsetMinutes * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `1234.5` → `$1,234.50`; `80000` → `COP 80,000`. Fixed `en-US` grouping on every surface. */
export function formatMoney(amount: number, currency: 'USD' | 'COP'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `COP ${Math.round(amount).toLocaleString('en-US')}`;
}
