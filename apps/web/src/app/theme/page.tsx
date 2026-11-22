import { describeAge, formatAsOf, assertSnapshot } from '@watchman/core';
import fixture from '@watchman/core/fixtures/synthetic/full.json';
import type { Metadata } from 'next';
import { PageShell, PivotHeader, Tile, TileGrid } from '@/components/metro';
import { attentionView, flowView, metricsView, spendView } from '@/lib/tiles';
import { ACCENTS, ACCENT_NAMES, TILE_FG, contrastRatio } from '@/theme/palette';
import { Section, Specimen, TileList } from './parts';

export const metadata: Metadata = {
  title: 'Theme preview · Watchman',
  description: 'The Metro theme and tile primitives, rendered from synthetic data.',
};

// Synthetic data only: this preview reads the committed fixture, never WATCHMAN_SNAPSHOT_DIR.
const snapshot = assertSnapshot(fixture, 'synthetic fixture full.json');
// Every relative time on the page is measured from the fixture's own stamp, so it renders the
// same on every run (and in screenshots).
const now = new Date(snapshot.generated_at);

const PIVOTS = [
  { label: 'tiles', href: '#tiles' },
  { label: 'states', href: '#states' },
  { label: 'type', href: '#type' },
  { label: 'palette', href: '#palette' },
];

export default function ThemePreview() {
  const attention = attentionView(snapshot, now);
  const flow = flowView(snapshot, now);
  const spend = spendView(snapshot, now);
  const metrics = metricsView(snapshot, 'Project Alpha');

  return (
    <PageShell
      header={
        <PivotHeader
          eyebrow="watchman · theme preview"
          title="metro"
          items={PIVOTS.map((p, i) => ({ ...p, current: i === 0 }))}
          navLabel="Theme preview sections"
        />
      }
      footer={
        <>
          Synthetic snapshot generated{' '}
          <time dateTime={snapshot.generated_at}>{formatAsOf(snapshot.generated_at)}</time>. Every
          figure on this page is invented.
        </>
      }
    >
      {snapshot.synthetic === true ? (
        <Specimen as="p" textStyle="metro.label" color="fg.muted" mb="8">
          Synthetic data: invented projects, round invented figures and example.com links.
        </Specimen>
      ) : null}

      <Section id="tiles" title="tiles">
        <TileGrid label="The four dashboard tiles">
          {attention.state === 'no_data' ? (
            <Tile
              title="Attention"
              size="large"
              noData={{ reason: attention.reason }}
              provenance={attention.stamp}
            />
          ) : (
            <Tile
              title="Attention"
              size="large"
              accent="cobalt"
              value={attention.items.length}
              caption={attention.items.length === 1 ? 'item needs your yes' : 'items need your yes'}
              provenance={attention.stamp}
              index={0}
            >
              <TileList
                items={attention.items.map((item) => ({
                  key: item.id,
                  href: item.url,
                  label: item.title,
                  meta: `${item.project} · waiting ${describeAge(item.waiting_since, now).replace(' ago', '')}`,
                }))}
              />
            </Tile>
          )}

          {flow.state === 'no_data' ? (
            <Tile
              title="Flow"
              size="wide"
              noData={{ reason: flow.reason }}
              provenance={flow.stamp}
              index={1}
            />
          ) : (
            <Tile
              title="Flow"
              size="wide"
              accent="emerald"
              value={flow.merged_this_week}
              caption={`done this week · ${flow.merged_last_week} last week (${flow.delta >= 0 ? '+' : ''}${flow.delta})`}
              provenance={flow.stamp}
              index={1}
            >
              <Specimen as="p" textStyle="metro.caption" m="0">
                {flow.open_prs} open PRs · {flow.open_issues} open issues · {flow.stale} stale over
                3 days
              </Specimen>
            </Tile>
          )}

          {spend.state === 'no_data' ? (
            <Tile
              title="Spend"
              size="wide"
              noData={{ reason: spend.reason }}
              provenance={spend.stamp}
              index={2}
            />
          ) : (
            <Tile
              title="Spend"
              size="wide"
              accent="crimson"
              value={spend.total?.usd ?? '—'}
              caption={
                spend.total === null
                  ? 'no cost reported this month'
                  : `${spend.total.cop} this month${spend.total.partial ? ` · ${spend.total.missing} provider without a reading` : ''}`
              }
              badge={spend.total?.partial ? 'partial' : undefined}
              provenance={spend.stamp}
              index={2}
            >
              <TileList
                items={spend.providers.map((p) => ({
                  key: p.id,
                  label: p.label,
                  meta:
                    p.quota.state === 'no_data'
                      ? 'quota: no data'
                      : `${p.quota.percent}% of quota · resets in ${p.quota.countdown.label}`,
                }))}
              />
            </Tile>
          )}

          {metrics.state === 'no_data' ? (
            <Tile
              title="Metrics"
              size="wide"
              noData={{ reason: metrics.reason }}
              provenance={metrics.stamp}
              index={3}
            />
          ) : (
            <Tile
              title="Metrics"
              size="wide"
              accent="violet"
              value={`${metrics.reported}/${metrics.total}`}
              caption="metrics reported"
              provenance={metrics.stamp}
              index={3}
            />
          )}
        </TileGrid>
      </Section>

      <Section id="states" title="states">
        <TileGrid label="Tile sizes and states">
          <Tile
            title="Small"
            value="12"
            caption="1 × 1"
            accent="teal"
            headingLevel={3}
            provenance={{ source: 'synthetic', as_of: snapshot.generated_at }}
          />
          <Tile
            title="Linked"
            value="→"
            caption="the whole tile opens"
            accent="orange"
            href="#states"
            headingLevel={3}
          />
          <Tile
            title="Wide"
            size="wide"
            value="40%"
            caption="2 × 1"
            accent="indigo"
            headingLevel={3}
            provenance={{ source: 'synthetic', as_of: snapshot.generated_at }}
          />
          <Tile
            title="No data"
            noData={{ reason: 'source not configured' }}
            headingLevel={3}
            provenance={{ source: 'synthetic', as_of: snapshot.generated_at }}
          />
          <Tile
            title="Manual entry"
            value="$10.00"
            caption="typed in by hand"
            accent="steel"
            badge="manual"
            headingLevel={3}
            provenance={{ source: 'manual entry', as_of: '2026-01-13T12:00:00Z', manual: true }}
          />
          <Tile
            title="Large"
            size="large"
            value="5"
            caption="2 × 2"
            accent="magenta"
            headingLevel={3}
            provenance={{ source: 'synthetic', as_of: snapshot.generated_at }}
          />
        </TileGrid>
      </Section>

      <Section id="type" title="type">
        <Specimen textStyle="metro.header">header · light 300</Specimen>
        <Specimen textStyle="metro.subheader">subheader · light 300</Specimen>
        <Specimen textStyle="metro.title">title · regular 400</Specimen>
        <Specimen textStyle="metro.body" maxWidth="40rem">
          Body · regular 400. Segoe UI where installed, then Selawik, then the self-hosted Open
          Sans, so every platform gets a Segoe-like face without shipping a font it may not
          redistribute.
        </Specimen>
        <Specimen textStyle="metro.label">label · semibold 600</Specimen>
        <Specimen textStyle="metro.caption" color="fg.muted">
          caption · source · as of {formatAsOf(snapshot.generated_at)}
        </Specimen>
      </Section>

      <Section id="palette" title="palette">
        <TileGrid label="Accent colours with their contrast against white text">
          {ACCENT_NAMES.map((name, i) => (
            <Tile
              key={name}
              title={name}
              accent={name}
              value={`${contrastRatio(ACCENTS[name], TILE_FG).toFixed(2)}:1`}
              caption={`${ACCENTS[name]} · WCAG AA`}
              headingLevel={3}
              index={i}
            />
          ))}
        </TileGrid>
      </Section>
    </PageShell>
  );
}
