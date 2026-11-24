import {
  STALE_AFTER_DAYS,
  combineProvenance,
  compareText,
  formatMoney,
  countNotYetEligible,
  metricCells,
  metricTrend,
  monthOf,
  rankAttention,
  staleItems,
  type Board,
  type FlowProject,
  type MetricName,
  type NoData,
  type RankedAttentionItem,
  type Snapshot,
  type StaleItem,
} from '@watchman/core';
import { flowView, spendView, type Stamp, type ViewOptions } from './tiles';

/**
 * What each drill-down view shows, from the same snapshot and `now` as the home tiles. Pure, like
 * `tiles.ts`; missing data stays missing, every row keeps its own stamp.
 */

type Missing = { state: 'no_data'; reason: string; stamp: Stamp };

const missing = (section: NoData): Missing => ({
  state: 'no_data',
  reason: section.reason,
  stamp: { source: section.source, as_of: section.as_of },
});

const stampOf = (r: { source: string; as_of: string; manual?: boolean }): Stamp => ({
  source: r.source,
  as_of: r.as_of,
  ...(r.manual === true ? { manual: true } : {}),
});

export type AttentionDetail =
  | Missing
  | {
      state: 'value';
      /** Every eligible item, ranked; the home tile shows the first five. */
      items: RankedAttentionItem[];
      /** Pull requests that have not waited 48h yet, so are not shown. */
      not_yet_due: number;
      stamp: Stamp;
    };

export function attentionDetail(snapshot: Snapshot, now: Date): AttentionDetail {
  const section = snapshot.attention;
  if (section.state === 'no_data') return missing(section);
  const items = rankAttention(section.candidates, now, { limit: section.candidates.length });
  return {
    state: 'value',
    items,
    not_yet_due: countNotYetEligible(section.candidates, now),
    stamp: combineProvenance([section, ...items]),
  };
}

export interface FlowProjectRow {
  project: string;
  open_prs: number;
  open_issues: number;
  stamp: Stamp;
}

export type BoardView =
  | Missing
  | { state: 'value'; columns: { name: string; count: number }[]; total: number; stamp: Stamp };

export function boardView(board: Board): BoardView {
  if (board.state === 'no_data') return missing(board);
  return {
    state: 'value',
    columns: board.columns,
    total: board.columns.reduce((sum, c) => sum + c.count, 0),
    stamp: stampOf(board),
  };
}

/** Projects with the most open work first, then by name. */
export function busiestProjects(projects: readonly FlowProject[]): FlowProjectRow[] {
  return [...projects]
    .sort(
      (a, b) =>
        b.open_prs + b.open_issues - (a.open_prs + a.open_issues) ||
        compareText(a.project, b.project),
    )
    .map((p) => ({
      project: p.project,
      open_prs: p.open_prs,
      open_issues: p.open_issues,
      stamp: stampOf(p),
    }));
}

export type FlowDetail =
  | Missing
  | {
      state: 'value';
      summary: Extract<ReturnType<typeof flowView>, { state: 'value' }>;
      projects: FlowProjectRow[];
      stale: StaleItem[];
      stale_after_days: number;
      board: BoardView;
    };

export function flowDetail(snapshot: Snapshot, now: Date, options: ViewOptions = {}): FlowDetail {
  const section = snapshot.flow;
  const summary = flowView(snapshot, now, options);
  // flowView is no_data exactly when the section is; both checks narrow the types.
  if (section.state === 'no_data' || summary.state === 'no_data') return missing(section as NoData);
  return {
    state: 'value',
    summary,
    projects: busiestProjects(section.projects),
    stale: staleItems(section.work_items, now),
    stale_after_days: STALE_AFTER_DAYS,
    board: boardView(section.board),
  };
}

export interface ProviderCostRow {
  id: string;
  label: string;
  cost:
    | { state: 'value'; usd: string; cop: string; stamp: Stamp }
    | { state: 'no_data'; reason: string; stamp: Stamp };
}

export type SpendDetail =
  | Missing
  | {
      state: 'value';
      summary: Extract<ReturnType<typeof spendView>, { state: 'value' }>;
      costs: ProviderCostRow[];
    };

export function spendDetail(snapshot: Snapshot, now: Date, options: ViewOptions = {}): SpendDetail {
  const section = snapshot.spend;
  const summary = spendView(snapshot, now, options);
  // spendView is no_data exactly when the section is; both checks narrow the types.
  if (section.state === 'no_data' || summary.state === 'no_data') return missing(section as NoData);
  const month = monthOf(now, options.utcOffsetMinutes);
  return {
    state: 'value',
    summary,
    costs: section.providers.map((p) => {
      const cost = p.monthly_cost;
      if (cost.state === 'no_data') {
        return { id: p.id, label: p.label, cost: missing(cost) };
      }
      if (cost.month !== month) {
        return {
          id: p.id,
          label: p.label,
          cost: {
            state: 'no_data',
            reason: `latest reading is for ${cost.month}, not ${month}`,
            stamp: stampOf(cost),
          },
        };
      }
      return {
        id: p.id,
        label: p.label,
        cost: {
          state: 'value',
          usd: formatMoney(cost.usd, 'USD'),
          cop: formatMoney(cost.cop, 'COP'),
          stamp: stampOf(cost),
        },
      };
    }),
  };
}

export interface MetricCellView {
  name: MetricName;
  trend:
    | {
        state: 'value';
        latest: number;
        delta: number | null;
        direction: 'up' | 'down' | 'flat' | 'single';
        unit?: string;
        stamp: Stamp;
      }
    | { state: 'no_data'; reason: string };
}

export interface MetricProjectView {
  project: string;
  reported: number;
  cells: MetricCellView[];
}

export type MetricsDetail =
  Missing | { state: 'value'; projects: MetricProjectView[]; stamp: Stamp };

/** The sixteen metrics for every project the scorecard reports, with each one's trend. */
export function metricsDetail(snapshot: Snapshot): MetricsDetail {
  const section = snapshot.metrics;
  if (section.state === 'no_data') return missing(section);
  const projects = [...section.projects]
    .sort((a, b) => compareText(a.project, b.project))
    .map((p): MetricProjectView => {
      const cells = metricCells(section, p.project).map((cell): MetricCellView => {
        const trend = metricTrend(cell.series);
        if (cell.series.state === 'no_data' || !('latest' in trend)) {
          const reason = cell.series.state === 'no_data' ? cell.series.reason : 'not reported';
          return { name: cell.name, trend: { state: 'no_data', reason } };
        }
        const delta = trend.delta;
        return {
          name: cell.name,
          trend: {
            state: 'value',
            latest: trend.latest,
            delta,
            direction: delta === null ? 'single' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
            ...(cell.series.unit === undefined ? {} : { unit: cell.series.unit }),
            stamp: stampOf(cell.series),
          },
        };
      });
      return {
        project: p.project,
        reported: cells.filter((c) => c.trend.state === 'value').length,
        cells,
      };
    });
  // The stamp covers every reported series, so an older or hand-typed one shows through.
  const reported = section.projects.flatMap((p) =>
    Object.values(p.metrics).filter((m) => m !== undefined && m.state === 'value'),
  );
  return { state: 'value', projects, stamp: combineProvenance([section, ...reported]) };
}
