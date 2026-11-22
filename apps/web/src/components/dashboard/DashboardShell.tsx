import { DAY_MS, describeAge, formatAsOf, toMillis } from '@watchman/core';
import type { ReactNode } from 'react';
import { PageShell, PivotHeader } from '@/components/metro';
import type { DashboardData } from '@/lib/dashboard-data';
import { Badge, Notice, StatusBar } from './parts';

export type DashboardView = 'start' | 'attention' | 'flow' | 'spend' | 'metrics';

export const VIEWS: { view: DashboardView; label: string; href: string }[] = [
  { view: 'start', label: 'start', href: '/' },
  { view: 'attention', label: 'attention', href: '/attention' },
  { view: 'flow', label: 'flow', href: '/flow' },
  { view: 'spend', label: 'spend', href: '/spend' },
  { view: 'metrics', label: 'metrics', href: '/metrics' },
];

/** A real snapshot older than this at the last read gets a caution under the header. */
export const STALE_SNAPSHOT_MS = DAY_MS;

/**
 * The frame every dashboard view shares: the pivot (start and the four drill-downs, the current
 * one marked), the data stamp — the snapshot's as-of time, where it came from and when this
 * server last read it — a visible "synthetic" badge on synthetic data, and a notice when the
 * configured snapshot could not be shown or is old. Read-only: there is nothing to act on here
 * but links.
 */
export function DashboardShell({
  view,
  title,
  data,
  children,
}: {
  view: DashboardView;
  title: string;
  data: DashboardData;
  children: ReactNode;
}) {
  const { snapshot } = data;
  const age = toMillis(data.read_at) - toMillis(snapshot.generated_at);
  return (
    <PageShell
      header={
        <PivotHeader
          eyebrow="watchman"
          title={title}
          navLabel="Dashboard views"
          items={VIEWS.map((v) => ({
            label: v.label,
            href: v.href,
            current: v.view === view,
          }))}
        />
      }
      footer={
        <>
          Read-only. Every figure carries its source and the time it was true; “no data” means the
          source did not report it, never zero. Relative times are measured from the data’s as-of
          time.
        </>
      }
    >
      <StatusBar>
        {snapshot.synthetic === true ? <Badge tone="warn">synthetic data</Badge> : null}
        <span data-testid="page-as-of">
          Data as of{' '}
          <time dateTime={snapshot.generated_at}>{formatAsOf(snapshot.generated_at)}</time>
        </span>
        <span>source {data.source}</span>
        <span data-testid="page-refreshed">
          refreshed <time dateTime={data.read_at}>{formatAsOf(data.read_at)}</time> · updates within
          the hour
        </span>
      </StatusBar>
      {data.origin === 'unavailable' ? (
        <Notice role="alert">
          The snapshot could not be shown: {data.problem}. Every tile reads “no data” until it can.
        </Notice>
      ) : null}
      {data.origin === 'file' && age > STALE_SNAPSHOT_MS ? (
        <Notice role="status">
          This snapshot was{' '}
          {describeAge(snapshot.generated_at, new Date(data.read_at)).replace(' ago', '')} old when
          last read. Run <code>npm run snapshot</code> to refresh it.
        </Notice>
      ) : null}
      {data.origin === 'file' && data.skipped.length > 0 ? (
        <Notice role="status">
          Showing {data.source}: the newer{' '}
          {data.skipped.length === 1 ? 'snapshot was' : 'snapshots were'} unusable (
          {data.skipped.map((s) => s.problem).join('; ')}).
        </Notice>
      ) : null}
      {children}
    </PageShell>
  );
}
