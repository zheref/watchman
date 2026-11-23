import {
  sourceGaps,
  type SectionKey,
  type Snapshot,
  type SourceStatusRecord,
} from '@watchman/core';
import type { ReactNode } from 'react';
import { Tile, TileList } from '@/components/metro';
import {
  attentionDetail,
  boardView,
  busiestProjects,
  KIND_LABEL,
  linkHost,
  metricsDetail,
  waitedLabel,
} from '@/lib/details';
import type { TileId } from '@/lib/layout';
import { attentionView, flowView, plural, spendView, type ViewOptions } from '@/lib/tiles';
import { TileLines } from './parts';

export interface HomeTile {
  id: TileId;
  title: string;
  node: ReactNode;
}

/** "partial: github failed — reason": a source behind the tile that failed or had no data. */
export function gapLine(gap: SourceStatusRecord): string {
  const what =
    gap.status === 'failed'
      ? `partial: ${gap.adapter} failed`
      : `missing: ${gap.adapter} had no data`;
  return gap.reason === undefined ? what : `${what} — ${gap.reason}`;
}

function gapLines(snapshot: Snapshot, section: SectionKey) {
  return sourceGaps(snapshot, section).map((g) => ({ key: g.adapter, text: gapLine(g) }));
}

/**
 * The four home tiles, most valuable first: Attention (what needs a yes, each item one click from
 * where it is acted on), then Flow, Spend and Metrics. Each tile's title opens its drill-down;
 * each tile's footer stamps every figure on it with source and as-of time.
 */
export function homeTiles(snapshot: Snapshot, now: Date, options: ViewOptions = {}): HomeTile[] {
  const attention = attentionView(snapshot, now);
  const attentionAll = attentionDetail(snapshot, now);
  const flow = flowView(snapshot, now, options);
  const spend = spendView(snapshot, now, options);
  const metrics = metricsDetail(snapshot);
  const gaps = {
    attention: gapLines(snapshot, 'attention'),
    flow: gapLines(snapshot, 'flow'),
    spend: gapLines(snapshot, 'spend'),
    metrics: gapLines(snapshot, 'metrics'),
  };
  const waiting =
    attentionAll.state === 'value'
      ? attentionAll.items.length
      : attention.state === 'value'
        ? attention.items.length
        : 0;
  const partial = (key: SectionKey) => (gaps[key].length > 0 ? 'partial' : undefined);
  const link = (id: TileId) => ({ titleHref: `/${id}`, titleHrefHint: 'details' });

  const attentionTile =
    attention.state === 'no_data' ? (
      <Tile
        title="Attention"
        size="large"
        noData={{ reason: attention.reason }}
        provenance={attention.stamp}
        {...link('attention')}
      />
    ) : (
      <Tile
        title="Attention"
        size="large"
        accent="cobalt"
        // The headline is everything waiting; the list is the most valuable and urgent few.
        value={waiting}
        caption={
          waiting === 0
            ? 'nothing needs your yes'
            : `${waiting === 1 ? 'item needs' : 'items need'} your yes${
                waiting > attention.items.length
                  ? ` · the ${attention.items.length} most urgent below`
                  : ''
              }`
        }
        badge={partial('attention') ?? (attention.stamp.manual === true ? 'manual' : undefined)}
        provenance={attention.stamp}
        index={0}
        {...link('attention')}
      >
        <TileList
          items={attention.items.map((item) => ({
            key: item.id,
            href: item.url,
            hrefHint: `opens ${linkHost(item.url)}`,
            label: item.title,
            meta: `${KIND_LABEL[item.kind]} · ${item.project} · waiting ${waitedLabel(item.waited_hours)}`,
          }))}
        />
        <TileLines lines={gaps.attention} />
      </Tile>
    );

  let flowTile: ReactNode;
  if (flow.state === 'no_data' || snapshot.flow.state === 'no_data') {
    flowTile = (
      <Tile
        title="Flow"
        size="wide"
        noData={{ reason: flow.state === 'no_data' ? flow.reason : 'no flow data' }}
        provenance={flow.stamp}
        index={1}
        {...link('flow')}
      />
    );
  } else {
    const board = boardView(snapshot.flow.board);
    const top = busiestProjects(snapshot.flow.projects).slice(0, 3);
    flowTile = (
      <Tile
        title="Flow"
        size="wide"
        accent="emerald"
        value={flow.done_this_week}
        caption={`done this week · ${flow.done_last_week} last week (${flow.delta >= 0 ? '+' : ''}${flow.delta})`}
        badge={partial('flow') ?? (flow.stamp.manual === true ? 'manual' : undefined)}
        provenance={flow.stamp}
        index={1}
        {...link('flow')}
      >
        <TileLines
          lines={[
            {
              key: 'totals',
              text: `${plural(flow.open_prs, 'open PR')} · ${plural(flow.open_issues, 'open issue')} · ${flow.stale} stale over ${flow.stale_after_days} days`,
            },
            {
              key: 'board',
              text:
                board.state === 'no_data'
                  ? `Handoff board: no data — ${board.reason}`
                  : `Handoff board: ${board.columns.map((c) => `${c.count} ${c.name.toLowerCase()}`).join(' · ')}`,
            },
            ...top.map((p) => ({
              key: `project-${p.project}`,
              text: `${p.project}: ${plural(p.open_prs, 'PR')} · ${plural(p.open_issues, 'issue')} open`,
            })),
            ...gaps.flow,
          ]}
        />
      </Tile>
    );
  }

  const spendTile =
    spend.state === 'no_data' ? (
      <Tile
        title="Spend"
        size="wide"
        noData={{ reason: spend.reason }}
        provenance={spend.stamp}
        index={2}
        {...link('spend')}
      />
    ) : (
      <Tile
        title="Spend"
        size="wide"
        accent="crimson"
        value={spend.total?.usd ?? 'No cost'}
        caption={
          spend.total === null
            ? `no provider reported a cost for ${spend.month}`
            : `${spend.total.cop} this month${spend.total.partial ? ` · ${plural(spend.total.missing, 'provider')} without a reading` : ''}`
        }
        badge={
          partial('spend') ??
          (spend.total?.partial === true
            ? 'partial'
            : spend.stamp.manual === true
              ? 'manual'
              : undefined)
        }
        provenance={spend.stamp}
        index={2}
        {...link('spend')}
      >
        <TileLines
          lines={[
            // Riskiest quota first: the highest share used, providers with no reading last.
            ...[...spend.providers]
              .sort(
                (a, b) =>
                  (b.quota.state === 'value' ? b.quota.fraction : -1) -
                  (a.quota.state === 'value' ? a.quota.fraction : -1),
              )
              .map((p) => ({
                key: p.id,
                text:
                  p.quota.state === 'no_data'
                    ? `${p.label}: quota no data`
                    : `${p.label}: ${p.quota.percent}% of quota${p.quota.exceeded ? ' (over)' : ''} · resets in ${p.quota.countdown.label}${p.quota.manual ? ' · manual' : ''}`,
              })),
            ...gaps.spend,
          ]}
        />
      </Tile>
    );

  const reporting = metrics.state === 'value' ? metrics.projects.filter((p) => p.reported > 0) : [];
  // Latest change of every reported metric across projects; a single reading has no trend yet.
  const trends = { up: 0, down: 0, flat: 0 };
  for (const project of reporting) {
    for (const cell of project.cells) {
      if (cell.trend.state !== 'value') continue;
      if (cell.trend.direction === 'up') trends.up += 1;
      else if (cell.trend.direction === 'down') trends.down += 1;
      else if (cell.trend.direction === 'flat') trends.flat += 1;
    }
  }
  const metricsTile =
    metrics.state === 'no_data' || reporting.length === 0 ? (
      <Tile
        title="Metrics"
        size="wide"
        noData={{
          reason:
            metrics.state === 'no_data' ? metrics.reason : 'no project has reported a metric yet',
        }}
        provenance={metrics.stamp}
        index={3}
        {...link('metrics')}
      />
    ) : (
      <Tile
        title="Metrics"
        size="wide"
        accent="violet"
        value={trends.up}
        caption={`${trends.up === 1 ? 'metric' : 'metrics'} improving · ${trends.down} declining · ${trends.flat} steady`}
        badge={partial('metrics') ?? (metrics.stamp.manual === true ? 'manual' : undefined)}
        provenance={metrics.stamp}
        index={3}
        {...link('metrics')}
      >
        <TileLines
          lines={[
            ...reporting.slice(0, 3).map((p) => ({
              key: p.project,
              text: `${p.project}: ${p.reported} of ${p.cells.length} metrics reported`,
            })),
            ...gaps.metrics,
          ]}
        />
      </Tile>
    );

  return [
    { id: 'attention', title: 'Attention', node: attentionTile },
    { id: 'flow', title: 'Flow', node: flowTile },
    { id: 'spend', title: 'Spend', node: spendTile },
    { id: 'metrics', title: 'Metrics', node: metricsTile },
  ];
}
