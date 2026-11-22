import { formatAsOf, sourceGaps } from '@watchman/core';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  BackToStart,
  Badge,
  DataTable,
  DetailSection,
  GapList,
  Meter,
  NoDataBlock,
  Text,
} from '@/components/dashboard/parts';
import { Provenance, Tile, TileGrid } from '@/components/metro';
import { spendDetail } from '@/lib/details';
import { plural } from '@/lib/tiles';
import { getDashboardData } from '@/server/dashboard';

export const metadata: Metadata = {
  title: 'Spend · Watchman',
  description: 'Quota used against each weekly reset, and the month’s cost in USD and COP.',
};

export default async function SpendPage() {
  const data = await getDashboardData();
  const now = new Date(data.snapshot.generated_at);
  const detail = spendDetail(data.snapshot, now, {
    utcOffsetMinutes: data.snapshot.utc_offset_minutes,
  });
  return (
    <DashboardShell view="spend" title="spend" data={data}>
      <BackToStart />
      <GapList gaps={sourceGaps(data.snapshot, 'spend')} />
      {detail.state === 'no_data' ? (
        <NoDataBlock reason={detail.reason} stamp={detail.stamp} />
      ) : (
        <>
          <DetailSection id="month" title={`cost in ${detail.summary.month}`}>
            {detail.summary.total === null ? (
              <NoDataBlock
                reason={`no provider reported a cost for ${detail.summary.month}`}
                stamp={detail.summary.stamp}
              />
            ) : (
              <TileGrid label="Monthly cost">
                <Tile
                  title="This month"
                  size="wide"
                  accent="crimson"
                  headingLevel={3}
                  value={detail.summary.total.usd}
                  caption={`${detail.summary.total.cop}${detail.summary.total.partial ? ` · ${plural(detail.summary.total.missing, 'provider')} without a reading` : ''}`}
                  badge={
                    detail.summary.total.partial
                      ? 'partial'
                      : detail.summary.total.stamp.manual === true
                        ? 'manual'
                        : undefined
                  }
                  provenance={detail.summary.total.stamp}
                />
              </TileGrid>
            )}
            <DataTable
              caption={`Cost per provider for ${detail.summary.month}`}
              columns={[
                { header: 'Provider' },
                { header: 'USD', numeric: true },
                { header: 'COP', numeric: true },
                { header: 'Source' },
              ]}
              rows={detail.costs.map((c) => ({
                key: c.id,
                cells:
                  c.cost.state === 'no_data'
                    ? [c.label, 'no data', c.cost.reason, <Provenance key="s" {...c.cost.stamp} />]
                    : [c.label, c.cost.usd, c.cost.cop, <Provenance key="s" {...c.cost.stamp} />],
              }))}
            />
          </DetailSection>

          <DetailSection id="quotas" title="quota against the reset">
            <Text textStyle="metro.body" mb="3">
              Countdowns run from the data’s as-of time to each provider’s next reset.
            </Text>
            <DataTable
              caption="Quota used per provider and time to its reset"
              columns={[
                { header: 'Provider' },
                { header: 'Used' },
                { header: 'Resets' },
                { header: 'Source' },
              ]}
              rows={detail.summary.providers.map((p) => ({
                key: p.id,
                cells:
                  p.quota.state === 'no_data'
                    ? [p.label, 'no data', p.quota.reason, <Provenance key="s" {...p.quota} />]
                    : [
                        p.label,
                        <span key="used">
                          {`${p.quota.percent}% · ${p.quota.used} of ${p.quota.limit} ${p.quota.unit}`}{' '}
                          {p.quota.exceeded ? <Badge tone="warn">over quota</Badge> : null}
                          <Meter percent={p.quota.percent} label={`${p.label} quota used`} />
                        </span>,
                        <span key="reset">
                          in {p.quota.countdown.label}
                          <br />
                          <time dateTime={p.quota.resets_at}>{formatAsOf(p.quota.resets_at)}</time>
                        </span>,
                        <Provenance
                          key="s"
                          source={p.quota.source}
                          as_of={p.quota.as_of}
                          manual={p.quota.manual}
                        />,
                      ],
              }))}
            />
          </DetailSection>
        </>
      )}
    </DashboardShell>
  );
}
