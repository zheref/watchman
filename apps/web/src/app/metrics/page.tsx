import { METRIC_NAMES, sourceGaps } from '@watchman/core';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  BackToStart,
  DataTable,
  DetailSection,
  GapList,
  NoDataBlock,
  SrOnly,
  Text,
} from '@/components/dashboard/parts';
import { Provenance } from '@/components/metro';
import { metricsDetail, type MetricCellView } from '@/lib/details';
import { getDashboardData } from '@/server/dashboard';

export const metadata: Metadata = {
  title: 'Metrics · Watchman',
  description: 'The sixteen merge-priority metrics per project, with their trends.',
};

const ARROW = { up: '▲', down: '▼', flat: '▬', single: '' } as const;
const WORD = { up: 'up', down: 'down', flat: 'unchanged', single: 'one reading' } as const;

function trendCell(cell: MetricCellView) {
  if (cell.trend.state === 'no_data') return 'no data';
  const t = cell.trend;
  const delta = t.delta === null ? '' : ` (${t.delta > 0 ? '+' : ''}${t.delta})`;
  return (
    <span key={cell.name}>
      {`${t.latest}${t.unit === undefined ? '' : ` ${t.unit}`}`}{' '}
      <span aria-hidden="true">{ARROW[t.direction]}</span>
      <SrOnly>{WORD[t.direction]}</SrOnly>
      {delta}
      <br />
      <Provenance {...t.stamp} />
    </span>
  );
}

export default async function MetricsPage() {
  const data = await getDashboardData();
  const detail = metricsDetail(data.snapshot);
  return (
    <DashboardShell view="metrics" title="metrics" data={data}>
      <BackToStart />
      <GapList gaps={sourceGaps(data.snapshot, 'metrics')} />
      <Text textStyle="metro.body" mt="3">
        The sixteen merge-priority metrics: {METRIC_NAMES.join(', ')}. They come from a scorecard
        source; until one reports, every metric reads “no data”, never an invented value.
      </Text>
      {detail.state === 'no_data' ? (
        <NoDataBlock reason={detail.reason} stamp={detail.stamp} />
      ) : detail.projects.length === 0 ? (
        <NoDataBlock reason="no project has reported a metric yet" stamp={detail.stamp} />
      ) : (
        detail.projects.map((p, i) => (
          <DetailSection
            key={p.project}
            id={`project-${i}`}
            title={`${p.project} · ${p.reported} of ${p.cells.length} reported`}
          >
            <DataTable
              caption={`Merge-priority metrics for ${p.project}`}
              columns={[{ header: 'Metric' }, { header: 'Latest and trend' }]}
              rows={p.cells.map((c) => ({ key: c.name, cells: [c.name, trendCell(c)] }))}
            />
          </DetailSection>
        ))
      )}
    </DashboardShell>
  );
}
