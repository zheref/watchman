import {
  STALE_AFTER_DAYS,
  combineProvenance,
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
  type Provenance,
  type QuotaStatus,
  type RankedAttentionItem,
  type Snapshot,
} from '@watchman/core';

/**
 * Turns a validated snapshot into what each of the four tiles shows. Pure: the same snapshot,
 * `now` and options give the same view, on the server and in tests. Missing sections stay
 * missing, and every combined figure carries the combined stamp of what went into it — the
 * oldest `as_of`, every source, and `manual` if any part was typed in.
 */

export type Stamp = Provenance;

export interface ViewOptions {
  /** The owner's offset from UTC in minutes, for week and month boundaries; UTC when absent. */
  utcOffsetMinutes?: number;
}

type Missing = { state: 'no_data'; reason: string; stamp: Stamp };

const missing = (section: NoData): Missing => ({
  state: 'no_data',
  reason: section.reason,
  stamp: { source: section.source, as_of: section.as_of },
});

export type AttentionView =
  Missing | { state: 'value'; items: RankedAttentionItem[]; stamp: Stamp };

export function attentionView(snapshot: Snapshot, now: Date): AttentionView {
  const section = snapshot.attention;
  if (section.state === 'no_data') return missing(section);
  const items = rankAttention(section.candidates, now);
  // The tile shows the ranked items, so its stamp is theirs (and the section's when it is empty).
  return { state: 'value', items, stamp: combineProvenance([section, ...items]) };
}

export type FlowView =
  | Missing
  | {
      state: 'value';
      /** Items completed (merged, closed or done) this week and last. */
      done_this_week: number;
      done_last_week: number;
      delta: number;
      stale: number;
      stale_after_days: number;
      open_prs: number;
      open_issues: number;
      stamp: Stamp;
    };

export function flowView(snapshot: Snapshot, now: Date, options: ViewOptions = {}): FlowView {
  const section = snapshot.flow;
  if (section.state === 'no_data') return missing(section);
  const t = throughput(section.work_items, now, { utcOffsetMinutes: options.utcOffsetMinutes });
  const totals = flowTotals(section.projects);
  return {
    state: 'value',
    done_this_week: t.this_week,
    done_last_week: t.last_week,
    delta: t.delta,
    stale: staleItems(section.work_items, now).length,
    stale_after_days: STALE_AFTER_DAYS,
    open_prs: totals.open_prs,
    open_issues: totals.open_issues,
    stamp: combineProvenance([section, ...section.projects, ...section.work_items]),
  };
}

export interface ProviderQuotaView {
  id: string;
  label: string;
  quota: QuotaStatus | NoData;
}

export interface SpendTotalView {
  usd: string;
  cop: string;
  partial: boolean;
  /** Providers with no cost reading for the month. */
  missing: number;
  /** The total's own stamp: its oldest reading, every billing source, manual if any part is. */
  stamp: Stamp;
}

export type SpendView =
  | Missing
  | {
      state: 'value';
      month: string;
      total: SpendTotalView | null;
      providers: ProviderQuotaView[];
      stamp: Stamp;
    };

export function spendView(snapshot: Snapshot, now: Date, options: ViewOptions = {}): SpendView {
  const section = snapshot.spend;
  if (section.state === 'no_data') return missing(section);
  const month = monthOf(now, options.utcOffsetMinutes);
  const total = monthlySpendTotal(section.providers, month, section.as_of);
  const quotas = section.providers.map((p) => p.quota);
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
            stamp: {
              source: total.source,
              as_of: total.as_of,
              ...(total.manual ? { manual: true } : {}),
            },
          },
    providers: section.providers.map((p) => ({
      id: p.id,
      label: p.label,
      quota: quotaStatus(p.quota, now),
    })),
    // The tile shows the quotas and the total, so its stamp covers both.
    stamp: combineProvenance([section, ...quotas, ...(total.state === 'value' ? [total] : [])]),
  };
}

export type MetricsView =
  Missing | { state: 'value'; reported: number; total: number; stamp: Stamp };

/**
 * How many of the sixteen metrics have data for `project`. A project with none is "no data" —
 * never "0 of 16".
 */
export function metricsView(snapshot: Snapshot, project: string): MetricsView {
  const section = snapshot.metrics;
  if (section.state === 'no_data') return missing(section);
  const cells = metricCells(section, project);
  const reported = cells.flatMap((c) => (c.series.state === 'value' ? [c.series] : []));
  if (reported.length === 0) {
    const first = cells[0]!.series as NoData;
    return missing({ ...first, reason: `no metrics reported for ${project}` });
  }
  return {
    state: 'value',
    reported: reported.length,
    total: cells.length,
    stamp: combineProvenance([section, ...reported]),
  };
}

/** "1 provider", "2 providers". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
