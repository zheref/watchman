import { formatAsOf, sourceGaps } from '@watchman/core';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  BackToStart,
  ScrollingTable as DataTable,
  DetailSection,
  GapList,
  NoDataBlock,
  SrOnly,
  Text,
  TextLink,
} from '@/components/dashboard/parts';
import { Provenance } from '@/components/metro';
import { KIND_LABEL, linkDestination, waitedLabel } from '@watchman/ui';
import { attentionDetail } from '@/lib/details';
import { getDashboardData } from '@/server/dashboard';

export const metadata: Metadata = {
  title: 'Attention · Watchman',
  description: 'Everything waiting on your yes, ranked by value and urgency.',
};

export default async function AttentionPage() {
  const data = await getDashboardData();
  const now = new Date(data.snapshot.generated_at);
  const detail = attentionDetail(data.snapshot, now);
  return (
    <DashboardShell view="attention" title="attention" data={data}>
      <BackToStart />
      <GapList gaps={sourceGaps(data.snapshot, 'attention')} />
      {detail.state === 'no_data' ? (
        <NoDataBlock reason={detail.reason} stamp={detail.stamp} />
      ) : (
        <DetailSection id="ranked" title="ranked by value and urgency" stamp={detail.stamp}>
          <Text textStyle="metro.body" mb="3">
            {detail.items.length === 0
              ? 'Nothing is waiting on your yes.'
              : `${detail.items.length} waiting on your yes; the home tile shows the first five. Each link opens where the item is revised, halted or unblocked.`}
            {detail.not_yet_due > 0
              ? ` ${detail.not_yet_due} more pull request${detail.not_yet_due === 1 ? ' has' : 's have'} not waited 48 hours yet.`
              : ''}
          </Text>
          {detail.items.length === 0 ? null : (
            <DataTable
              caption="Items waiting on your yes, most valuable and urgent first"
              columns={[
                { header: '#', numeric: true },
                { header: 'Item' },
                { header: 'Why' },
                { header: 'Waiting', numeric: true },
                { header: 'Due' },
                { header: 'Value × urgency', numeric: true },
                { header: 'Source' },
              ]}
              rows={detail.items.map((item, i) => ({
                key: item.id,
                cells: [
                  i + 1,
                  <span key="item" data-attention-item={item.id}>
                    <TextLink href={item.url}>
                      {item.title}
                      <SrOnly>{` (opens ${linkDestination(item.url)})`}</SrOnly>
                    </TextLink>
                    <br />
                    {item.project}
                  </span>,
                  KIND_LABEL[item.kind],
                  waitedLabel(item.waited_hours),
                  item.due_at === undefined ? (
                    '—'
                  ) : (
                    <time key="due" dateTime={item.due_at}>
                      {formatAsOf(item.due_at)}
                    </time>
                  ),
                  `${item.value} × ${item.urgency} = ${item.score}`,
                  <Provenance
                    key="stamp"
                    source={item.source}
                    as_of={item.as_of}
                    manual={item.manual}
                  />,
                ],
              }))}
            />
          )}
        </DetailSection>
      )}
    </DashboardShell>
  );
}
