import { noData, type NoData } from './provenance';
import {
  METRIC_NAMES,
  type MetricName,
  type MetricSeries,
  type MetricsSection,
  type ProjectMetrics,
} from './snapshot';

/**
 * Metrics: the sixteen merge-priority metrics per project. Until a scorecard source exists the
 * whole section is `no_data`, and every cell reads "no data" — never a placeholder number.
 */

export interface MetricCell {
  name: MetricName;
  series: MetricSeries | NoData;
}

/**
 * All sixteen metrics for `project`, in canonical order. A metric the section does not report —
 * or a section, or project, that is missing altogether — is a `no_data` cell naming why.
 */
export function metricCells(section: MetricsSection, project: string): MetricCell[] {
  if (section.state === 'no_data') {
    return METRIC_NAMES.map((name) => ({ name, series: section }));
  }
  const entry: ProjectMetrics | undefined = section.projects.find((p) => p.project === project);
  return METRIC_NAMES.map((name) => ({
    name,
    series:
      entry?.metrics[name] ??
      noData(
        entry === undefined
          ? `no metrics reported for ${project}`
          : `${name} not reported for ${project}`,
        section.source,
        section.as_of,
      ),
  }));
}

export interface MetricTrend {
  latest: number;
  /** `null` when the series has a single point. */
  previous: number | null;
  /** `latest - previous`, or `null` with a single point. */
  delta: number | null;
  latest_at: string;
}

/** Latest value and change from the point before it (points are ordered by time first). */
export function metricTrend(series: MetricSeries): MetricTrend | NoData {
  if (series.state === 'no_data') return series;
  const points = [...series.points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = points[points.length - 1]!;
  const before = points.length > 1 ? points[points.length - 2]! : undefined;
  return {
    latest: last.value,
    previous: before?.value ?? null,
    delta: before === undefined ? null : last.value - before.value,
    latest_at: last.at,
  };
}
