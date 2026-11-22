import { sourceGaps } from '@watchman/core';
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
  TextLink,
} from '@/components/dashboard/parts';
import { Provenance, Tile, TileGrid } from '@/components/metro';
import { flowDetail, linkHost } from '@/lib/details';
import { plural } from '@/lib/tiles';
import { getDashboardData } from '@/server/dashboard';

export const metadata: Metadata = {
  title: 'Flow · Watchman',
  description:
    'Open work per project, throughput this week against last, stale items and the board.',
};

const KIND_WORD = { pr: 'Pull request', issue: 'Issue', card: 'Card' } as const;

export default async function FlowPage() {
  const data = await getDashboardData();
  const now = new Date(data.snapshot.generated_at);
  const detail = flowDetail(data.snapshot, now, {
    utcOffsetMinutes: data.snapshot.utc_offset_minutes,
  });
  return (
    <DashboardShell view="flow" title="flow" data={data}>
      <BackToStart />
      <GapList gaps={sourceGaps(data.snapshot, 'flow')} />
      {detail.state === 'no_data' ? (
        <NoDataBlock reason={detail.reason} stamp={detail.stamp} />
      ) : (
        <>
          <DetailSection id="throughput" title="this week">
            <TileGrid label="Throughput and open work">
              <Tile
                title="Done this week"
                accent="emerald"
                headingLevel={3}
                value={detail.summary.done_this_week}
                caption={`${detail.summary.done_last_week} last week (${detail.summary.delta >= 0 ? '+' : ''}${detail.summary.delta})`}
                provenance={detail.summary.stamp}
              />
              <Tile
                title="Open"
                accent="teal"
                headingLevel={3}
                value={detail.summary.open_prs + detail.summary.open_issues}
                caption={`${plural(detail.summary.open_prs, 'PR')} · ${plural(detail.summary.open_issues, 'issue')}`}
                provenance={detail.summary.stamp}
              />
              <Tile
                title="Stale"
                accent={detail.stale.length > 0 ? 'orange' : 'steel'}
                headingLevel={3}
                value={detail.stale.length}
                caption={`untouched over ${detail.stale_after_days} days`}
                provenance={detail.summary.stamp}
              />
            </TileGrid>
          </DetailSection>

          <DetailSection id="projects" title="open work per project">
            {detail.projects.length === 0 ? (
              <Text textStyle="metro.body">No project reported open work.</Text>
            ) : (
              <DataTable
                caption="Open pull requests and issues per project, busiest first"
                columns={[
                  { header: 'Project' },
                  { header: 'Open PRs', numeric: true },
                  { header: 'Open issues', numeric: true },
                  { header: 'Source' },
                ]}
                rows={detail.projects.map((p) => ({
                  key: p.project,
                  cells: [
                    p.project,
                    p.open_prs,
                    p.open_issues,
                    <Provenance key="stamp" {...p.stamp} />,
                  ],
                }))}
              />
            )}
          </DetailSection>

          <DetailSection id="stale" title={`stale over ${detail.stale_after_days} days`}>
            {detail.stale.length === 0 ? (
              <Text textStyle="metro.body">Nothing open has gone untouched that long.</Text>
            ) : (
              <DataTable
                caption="Open items not updated recently, most idle first"
                columns={[
                  { header: 'Item' },
                  { header: 'Kind' },
                  { header: 'Idle', numeric: true },
                  { header: 'Source' },
                ]}
                rows={detail.stale.map((w) => ({
                  key: w.id,
                  cells: [
                    <span key="item">
                      <TextLink href={w.url}>
                        {w.title}
                        <SrOnly>{` (opens ${linkHost(w.url)})`}</SrOnly>
                      </TextLink>
                      <br />
                      {w.project}
                    </span>,
                    KIND_WORD[w.kind],
                    `${w.idle_days}d`,
                    <Provenance key="stamp" source={w.source} as_of={w.as_of} manual={w.manual} />,
                  ],
                }))}
              />
            )}
          </DetailSection>

          <DetailSection
            id="board"
            title="handoff board"
            stamp={detail.board.state === 'value' ? detail.board.stamp : undefined}
          >
            {detail.board.state === 'no_data' ? (
              <NoDataBlock reason={detail.board.reason} stamp={detail.board.stamp} />
            ) : (
              <TileGrid label="Handoff board cards by state">
                {detail.board.columns.map((c) => (
                  <Tile
                    key={c.name}
                    title={c.name}
                    headingLevel={3}
                    accent={/block/i.test(c.name) ? 'red' : /done/i.test(c.name) ? 'green' : 'blue'}
                    value={c.count}
                    caption={c.count === 1 ? 'card' : 'cards'}
                  />
                ))}
              </TileGrid>
            )}
          </DetailSection>
        </>
      )}
    </DashboardShell>
  );
}
