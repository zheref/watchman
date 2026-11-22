import {
  flowTotals,
  formatMoney,
  metricCells,
  monthOf,
  monthlySpendTotal,
  quotaStatus,
  rankAttention,
  staleItems,
  throughput,
  type NoData,
  type QuotaStatus,
  type RankedAttentionItem,
  type Snapshot,
} from '@watchman/core';

/**
 * Turns a validated snapshot into what each of the four tiles shows. Pure: the same snapshot
 * and `now` give the same view, on the server and in tests. Missing sections stay missing.
 */

export interface Stamp {
  source: string;
  as_of: string;
  manual?: boolean;
}

type Missing = { state: 'no_data'; reason: string; stamp: Stamp };

const missing = (section: NoData): Missing => ({
  state: 'no_data',
  reason: section.reason,
  stamp: { source: section.source, as_of: section.as_of },
});

const stampOf = (s: { source: string; as_of: string; manual?: boolean }): Stamp => ({
  source: s.source,
  as_of: s.as_of,
  ...(s.manual === true ? { manual: true } : {}),
});

export type AttentionView =
  Missing | { state: 'value'; items: RankedAttentionItem[]; stamp: Stamp };

export function attentionView(snapshot: Snapshot, now: Date): AttentionView {
  const section = snapshot.attention;
  if (section.state === 'no_data') return missing(section);
  return { state: 'value', items: rankAttention(section.candidates, now), stamp: stampOf(section) };
}

export type FlowView =
  | Missing
  | {
      state: 'value';
      merged_this_week: number;
      merged_last_week: number;
      delta: number;
      stale: number;
      open_prs: number;
      open_issues: number;
      stamp: Stamp;
    };

export function flowView(snapshot: Snapshot, now: Date): FlowView {
  const section = snapshot.flow;
  if (section.state === 'no_data') return missing(section);
  const t = throughput(section.work_items, now);
  const totals = flowTotals(section.projects);
  return {
    state: 'value',
    merged_this_week: t.this_week,
    merged_last_week: t.last_week,
    delta: t.delta,
    stale: staleItems(section.work_items, now).length,
    open_prs: totals.open_prs,
    open_issues: totals.open_issues,
    stamp: stampOf(section),
  };
}

export interface ProviderQuotaView {
  id: string;
  label: string;
  quota: QuotaStatus | NoData;
}

export type SpendView =
  | Missing
  | {
      state: 'value';
      month: string;
      total: {
        usd: string;
        cop: string;
        partial: boolean;
        missing: number;
        manual: boolean;
      } | null;
      providers: ProviderQuotaView[];
      stamp: Stamp;
    };

export function spendView(snapshot: Snapshot, now: Date): SpendView {
  const section = snapshot.spend;
  if (section.state === 'no_data') return missing(section);
  const month = monthOf(now);
  const total = monthlySpendTotal(section.providers, month, section.as_of);
  return {
    state: 'value',
    month,
    total:
      total.state === 'no_data'
        ? null
        : {
            usd: formatMoney(total.usd, 'USD'),
            cop: formatMoney(total.cop, 'COP'),
            partial: total.partial,
            missing: total.missing.length,
            manual: total.manual,
          },
    providers: section.providers.map((p) => ({
      id: p.id,
      label: p.label,
      quota: quotaStatus(p.quota, now),
    })),
    stamp: stampOf(section),
  };
}

export type MetricsView =
  Missing | { state: 'value'; reported: number; total: number; stamp: Stamp };

/** How many of the sixteen metrics have data for `project`. */
export function metricsView(snapshot: Snapshot, project: string): MetricsView {
  const section = snapshot.metrics;
  if (section.state === 'no_data') return missing(section);
  const cells = metricCells(section, project);
  return {
    state: 'value',
    reported: cells.filter((c) => c.series.state === 'value').length,
    total: cells.length,
    stamp: stampOf(section),
  };
}
