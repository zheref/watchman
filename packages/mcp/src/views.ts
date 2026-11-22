import {
  ATTENTION_LIMIT,
  combineProvenance,
  countNotYetEligible,
  isAtOrAfter,
  matchesProject,
  metricCells,
  metricTrend,
  monthOf,
  monthlySpendTotal,
  noData,
  normalizeProject,
  quotaStatus,
  rankAttention,
  sourceGaps,
  staleItems,
  throughput,
  flowTotals,
  type MetricTrend,
  type NoData,
  type ProviderSpend,
  type SectionKey,
  type Snapshot,
} from '@watchman/core';
import type { LoadedSnapshot } from './snapshot';
import type { AttentionOutput, FlowOutput, MetricsOutput, SpendOutput } from './schemas';

/**
 * The four responses, built from one loaded snapshot, a resolved filter and `now`. Pure: the same
 * inputs always give the same JSON, which is what CONTRACT.md's examples and the tests rely on.
 * Each narrows only what carries a project or a date, and says so where something cannot be
 * narrowed (the board, spend per project) instead of guessing.
 *
 * A section's stamp, and so the response's top-level `source` and `as_of`, is the combined
 * provenance of every record behind its figures (core's `combineProvenance`, as the web app's
 * tiles use): every source named, the oldest `as_of`, and `manual` when any part was typed in.
 */

export interface ResolvedFilter {
  /** The project as the caller gave it, trimmed. */
  project?: string;
  /** The effective lower bound, ISO 8601 UTC. */
  since?: string;
}

interface Provenanced {
  source: string;
  as_of: string;
  manual?: boolean;
}

/** `{ source, as_of, manual? }`, with `manual` only when true, so manual figures stay labelled. */
function stamp(record: Provenanced): Provenanced {
  return {
    source: record.source,
    as_of: record.as_of,
    ...(record.manual === true ? { manual: true } : {}),
  };
}

function envelope(loaded: LoadedSnapshot, key: SectionKey, filter: ResolvedFilter, now: Date) {
  const { snapshot } = loaded;
  const section = snapshot[key];
  const gaps = sourceGaps(snapshot, key).map((g) => ({
    adapter: g.adapter,
    status: g.status as 'no_data' | 'failed',
    ...(g.reason !== undefined ? { reason: g.reason } : {}),
  }));
  return {
    source: section.source,
    as_of: section.as_of,
    synthetic: loaded.origin === 'synthetic-fixture' || snapshot.synthetic === true,
    evaluated_at: now.toISOString(),
    snapshot: {
      origin: loaded.origin,
      file: loaded.source,
      generated_at: snapshot.generated_at,
      ...(loaded.skipped.length > 0 ? { skipped: loaded.skipped } : {}),
    },
    filter: {
      ...(filter.project !== undefined ? { project: filter.project } : {}),
      ...(filter.since !== undefined ? { since: filter.since } : {}),
    },
    ...(gaps.length > 0 ? { gaps } : {}),
  };
}

/**
 * Every project name the snapshot mentions anywhere: attention candidates, flow projects and work
 * items, metrics projects. A project filter naming none of them is not "nothing open" but "no
 * such project", so the views answer `no_data` for it rather than zeros.
 */
export function knownProjects(snapshot: Snapshot): Set<string> {
  const names: string[] = [];
  if (snapshot.attention.state === 'value')
    names.push(...snapshot.attention.candidates.map((c) => c.project));
  if (snapshot.flow.state === 'value') {
    names.push(...snapshot.flow.projects.map((p) => p.project));
    names.push(...snapshot.flow.work_items.map((w) => w.project));
  }
  if (snapshot.metrics.state === 'value')
    names.push(...snapshot.metrics.projects.map((p) => p.project));
  return new Set(names.map(normalizeProject));
}

/** The `no_data` a section answers for a project the snapshot does not know, or `null`. */
function unknownProject(
  loaded: LoadedSnapshot,
  filter: ResolvedFilter,
  section: Provenanced,
): NoData | null {
  if (filter.project === undefined) return null;
  if (knownProjects(loaded.snapshot).has(normalizeProject(filter.project))) return null;
  return noData(
    `no project named ${JSON.stringify(filter.project)} in this snapshot`,
    section.source,
    section.as_of,
  );
}

/** The response's top-level stamp is its section's. */
function topLevel(record: Provenanced): { source: string; as_of: string } {
  return { source: record.source, as_of: record.as_of };
}

// --- get_attention -------------------------------------------------------------------------------

export function attentionView(
  loaded: LoadedSnapshot,
  filter: ResolvedFilter,
  now: Date,
  limit: number = ATTENTION_LIMIT,
): AttentionOutput {
  const base = envelope(loaded, 'attention', filter, now);
  const section = loaded.snapshot.attention;
  if (section.state === 'no_data') return { ...base, attention: section };
  const unknown = unknownProject(loaded, filter, section);
  if (unknown !== null) return { ...base, attention: unknown };
  const candidates = section.candidates.filter(
    (c) => matchesProject(c.project, filter.project) && isAtOrAfter(c.waiting_since, filter.since),
  );
  const ranked = rankAttention(candidates, now, { limit: candidates.length });
  const sectionStamp = combineProvenance([section, ...ranked]);
  return {
    ...base,
    ...topLevel(sectionStamp),
    attention: {
      state: 'value',
      ...sectionStamp,
      total: ranked.length,
      not_yet_due: countNotYetEligible(candidates, now),
      items: ranked.slice(0, limit).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        project: item.project,
        url: item.url,
        value: item.value,
        urgency: item.urgency,
        score: item.score,
        waited_hours: item.waited_hours,
        waiting_since: item.waiting_since,
        ...(item.due_at !== undefined ? { due_at: item.due_at } : {}),
        ...stamp(item),
      })),
    },
  };
}

// --- get_flow ------------------------------------------------------------------------------------

export function flowView(loaded: LoadedSnapshot, filter: ResolvedFilter, now: Date): FlowOutput {
  const base = envelope(loaded, 'flow', filter, now);
  const { snapshot } = loaded;
  const section = snapshot.flow;
  if (section.state === 'no_data') return { ...base, flow: section };
  const unknown = unknownProject(loaded, filter, section);
  if (unknown !== null) return { ...base, flow: unknown };
  const projects = section.projects.filter((p) => matchesProject(p.project, filter.project));
  const projectItems = section.work_items.filter((w) => matchesProject(w.project, filter.project));
  const since = filter.since;
  // An item is in the window when anything happened to it at or after `since`.
  const windowItems = projectItems.filter(
    (w) =>
      isAtOrAfter(w.opened_at, since) ||
      isAtOrAfter(w.updated_at, since) ||
      (w.completed_at !== undefined && isAtOrAfter(w.completed_at, since)),
  );
  const weekOptions = { utcOffsetMinutes: snapshot.utc_offset_minutes ?? 0 };
  const showBoard = filter.project === undefined && section.board.state === 'value';
  const sectionStamp = combineProvenance([
    section,
    ...projects,
    ...projectItems,
    ...(showBoard ? [section.board] : []),
  ]);
  return {
    ...base,
    ...topLevel(sectionStamp),
    flow: {
      state: 'value',
      ...sectionStamp,
      totals: flowTotals(projects),
      projects: projects.map((p) => ({
        project: p.project,
        open_prs: p.open_prs,
        open_issues: p.open_issues,
        ...stamp(p),
      })),
      throughput: throughput(projectItems, now, weekOptions),
      ...(since !== undefined
        ? {
            window: {
              since,
              opened: projectItems.filter((w) => isAtOrAfter(w.opened_at, since)).length,
              completed: projectItems.filter(
                (w) => w.completed_at !== undefined && isAtOrAfter(w.completed_at, since),
              ).length,
            },
          }
        : {}),
      stale: staleItems(windowItems, now).map((w) => ({
        id: w.id,
        project: w.project,
        kind: w.kind,
        title: w.title,
        url: w.url,
        idle_days: w.idle_days,
        updated_at: w.updated_at,
        ...stamp(w),
      })),
      board:
        filter.project !== undefined
          ? noData(
              'the board is not broken down by project',
              section.board.source,
              section.board.as_of,
            )
          : section.board.state === 'no_data'
            ? section.board
            : { state: 'value', ...stamp(section.board), columns: section.board.columns },
    },
  };
}

// --- get_spend -----------------------------------------------------------------------------------

/** A reading older than the time bound is not shown as current: it becomes `no_data`, saying why. */
function olderThan(record: Provenanced, since: string | undefined): NoData | null {
  if (isAtOrAfter(record.as_of, since)) return null;
  return noData(`reading from ${record.as_of} is older than ${since}`, record.source, record.as_of);
}

export function spendView(loaded: LoadedSnapshot, filter: ResolvedFilter, now: Date): SpendOutput {
  const base = envelope(loaded, 'spend', filter, now);
  const { snapshot } = loaded;
  const section = snapshot.spend;
  if (section.state === 'no_data') return { ...base, spend: section };
  if (filter.project !== undefined) {
    return {
      ...base,
      spend: noData(
        'spend is reported per provider, not per project',
        section.source,
        section.as_of,
      ),
    };
  }
  const since = filter.since;
  const providers: ProviderSpend[] = section.providers.map((p) => ({
    ...p,
    quota: p.quota.state === 'value' ? (olderThan(p.quota, since) ?? p.quota) : p.quota,
    monthly_cost:
      p.monthly_cost.state === 'value'
        ? (olderThan(p.monthly_cost, since) ?? p.monthly_cost)
        : p.monthly_cost,
  }));
  const month = monthOf(now, snapshot.utc_offset_minutes ?? 0);
  const total = monthlySpendTotal(providers, month, section.as_of);
  const quotas = providers.map((p) => quotaStatus(p.quota, now));
  const sectionStamp = combineProvenance([
    section,
    ...quotas.filter((q) => q.state === 'value'),
    ...(total.state === 'value' ? [total] : []),
  ]);
  return {
    ...base,
    ...topLevel(sectionStamp),
    spend: {
      state: 'value',
      ...sectionStamp,
      month,
      total,
      providers: providers.map((p, index) => {
        const quota = quotas[index]!;
        const cost = p.monthly_cost;
        return {
          id: p.id,
          label: p.label,
          quota:
            quota.state === 'no_data'
              ? quota
              : {
                  state: 'value',
                  used: quota.used,
                  limit: quota.limit,
                  unit: quota.unit,
                  percent: quota.percent,
                  remaining: quota.remaining,
                  exceeded: quota.exceeded,
                  resets_at: quota.resets_at,
                  resets_in: quota.countdown.label,
                  ...stamp(quota),
                },
          monthly_cost:
            cost.state === 'no_data'
              ? cost
              : { state: 'value', month: cost.month, usd: cost.usd, cop: cost.cop, ...stamp(cost) },
        };
      }),
    },
  };
}

// --- get_metrics ---------------------------------------------------------------------------------

export function metricsView(
  loaded: LoadedSnapshot,
  filter: ResolvedFilter,
  now: Date,
): MetricsOutput {
  const base = envelope(loaded, 'metrics', filter, now);
  const section = loaded.snapshot.metrics;
  if (section.state === 'no_data') return { ...base, metrics: section };
  const unknown = unknownProject(loaded, filter, section);
  if (unknown !== null) return { ...base, metrics: unknown };
  // With a project filter, the one project asked for — by its reported name when it has metrics —
  // even when the snapshot knows it but reports no metrics for it: sixteen explicit no-data cells.
  const names =
    filter.project === undefined
      ? section.projects.map((p) => p.project)
      : [
          section.projects.find(
            (p) => normalizeProject(p.project) === normalizeProject(filter.project!),
          )?.project ?? filter.project,
        ];
  const since = filter.since;
  const projects = names.map((project) => ({
    project,
    metrics: metricCells(section, project).map(({ name, series }): MetricCell => {
      if (series.state === 'no_data') {
        return {
          name,
          state: 'no_data',
          reason: series.reason,
          source: series.source,
          as_of: series.as_of,
        };
      }
      const points = series.points
        .filter((p) => isAtOrAfter(p.at, since))
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      if (points.length === 0) {
        return {
          name,
          state: 'no_data',
          reason: `no ${name} points at or after ${since}`,
          source: series.source,
          as_of: series.as_of,
        };
      }
      // A value series with at least one point always has a trend.
      const trend = metricTrend({ ...series, points }) as MetricTrend;
      return {
        name,
        state: 'value',
        ...(series.unit !== undefined ? { unit: series.unit } : {}),
        latest: trend.latest,
        previous: trend.previous,
        delta: trend.delta,
        latest_at: trend.latest_at,
        points,
        ...stamp(series),
      };
    }),
  }));
  const reported = projects.flatMap((p) =>
    p.metrics.filter((m): m is Extract<MetricCell, { state: 'value' }> => m.state === 'value'),
  );
  const sectionStamp = combineProvenance([section, ...reported]);
  return {
    ...base,
    ...topLevel(sectionStamp),
    metrics: { state: 'value', ...sectionStamp, projects },
  };
}

type MetricCell = Extract<
  MetricsOutput['metrics'],
  { state: 'value' }
>['projects'][number]['metrics'][number];
