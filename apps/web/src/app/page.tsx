import { PageShell, PivotHeader, Tile, TileGrid } from '@/components/metro';

/**
 * Placeholder home. The real home view (the four live tiles and their drill-downs) is a later
 * phase; until then this page only proves the shared Metro theme and points at its preview.
 */
export default function Home() {
  return (
    <PageShell
      header={
        <PivotHeader
          eyebrow="watchman"
          title="start"
          items={[
            { label: 'start', href: '/', current: true },
            { label: 'theme', href: '/theme' },
          ]}
        />
      }
    >
      <TileGrid>
        <Tile
          title="Dashboard"
          size="wide"
          noData={{ reason: 'The four tiles arrive in a later release.' }}
        />
        <Tile
          title="Theme preview"
          accent="cobalt"
          href="/theme"
          value={<span aria-hidden="true">→</span>}
          caption="See every tile state"
        />
      </TileGrid>
    </PageShell>
  );
}
