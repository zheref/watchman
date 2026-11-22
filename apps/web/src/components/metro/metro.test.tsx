import { describe, expect, it } from 'vitest';
import { renderHtml, renderMarkup } from '@/test/render';
import { PageShell, PivotHeader, Tile, TileGrid } from './index';

const stamp = { source: 'synthetic', as_of: '2026-01-14T14:30:00Z' };

describe('Tile', () => {
  it('shows the figure, its caption and its provenance', () => {
    const html = renderMarkup(
      <Tile
        title="Flow"
        accent="emerald"
        size="wide"
        value={3}
        caption="done this week"
        provenance={stamp}
      />,
    );
    expect(html).toMatch(/^<article[^>]*aria-labelledby="([^"]+)"/);
    expect(html).toContain('data-size="wide"');
    expect(html).toContain('data-state="value"');
    expect(html).toMatch(/<h2 id="[^"]+"[^>]*>Flow<\/h2>/);
    expect(html).toContain('>3</p>');
    expect(html).toContain('done this week');
    expect(html).toContain('synthetic');
    expect(html).toContain('<time dateTime="2026-01-14T14:30:00Z">2026-01-14 14:30 UTC</time>');
  });

  it('says "No data" and why, and never renders a value, when data is missing', () => {
    const html = renderMarkup(
      <Tile
        title="Metrics"
        value={0}
        caption="hidden"
        noData={{ reason: 'no scorecard yet' }}
        provenance={stamp}
      />,
    );
    expect(html).toContain('data-state="no-data"');
    expect(html).toContain('No data');
    expect(html).toContain('no scorecard yet');
    expect(html).not.toContain('>0<');
    expect(html).not.toContain('hidden');
  });

  it('labels a manual entry and shows a badge', () => {
    const html = renderMarkup(
      <Tile
        title="Spend"
        value="$10.00"
        badge="manual"
        provenance={{ ...stamp, manual: true }}
        headingLevel={3}
      />,
    );
    expect(html).toContain('manual entry');
    expect(html).toContain('data-part="badge"');
    expect(html).toMatch(/<h3 /);
  });

  it('becomes a link when given an href, and omits an empty footer', () => {
    const html = renderMarkup(<Tile title="Theme" href="/theme" value="→" />);
    expect(html).toMatch(/^<a[^>]*href="\/theme"/);
    expect(html).not.toContain('data-part="footer"');
  });

  it('accepts a custom footer and caps the entrance stagger', () => {
    const html = renderMarkup(<Tile title="T" footer="custom footer" index={99} />);
    expect(html).toContain('custom footer');
    expect(html).toContain('animation-delay:300ms');
  });

  it('styles from the theme: flat accent, square corners, motion only when allowed', () => {
    const css = renderHtml(<Tile title="T" accent="crimson" value={1} />);
    expect(css).toContain('--chakra-colors-tile-crimson');
    expect(css).toContain('prefers-reduced-motion: no-preference');
    expect(css).not.toMatch(/border-radius:\s*(?!0)[1-9]/);
  });
});

describe('Tile title link', () => {
  it('stretches over the tile, lifts inner links and draws its focus ring inside the tile', () => {
    const html = renderHtml(
      <Tile title="Attention" titleHref="/attention" titleHrefHint="details" value={1}>
        <a href="https://example.com/x">x</a>
      </Tile>,
    );
    expect(html).toMatch(/<a[^>]*href="\/attention"[^>]*data-part="title-link"/);
    expect(html).toContain(' details');
    // The tile clips overflow, so an outset ring would be invisible (WCAG 2.4.7).
    expect(html).toMatch(/outline-offset:\s*-6px/);
    expect(html).not.toMatch(/::after[^}]*outline-offset:\s*3px/);
  });
});

describe('PivotHeader', () => {
  it('renders the title as the page heading and marks the current pivot', () => {
    const html = renderMarkup(
      <PivotHeader
        eyebrow="watchman"
        title="metro"
        navLabel="Sections"
        items={[
          { label: 'tiles', href: '#tiles', current: true },
          { label: 'type', href: '#type' },
        ]}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>metro<\/h1>/);
    expect(html).toContain('aria-label="Sections"');
    expect(html).toMatch(
      /href="#tiles"[^>]*aria-current="page"|aria-current="page"[^>]*href="#tiles"/,
    );
    expect(html).not.toMatch(/href="#type"[^>]*aria-current/);
  });

  it('omits the nav and eyebrow when there are none', () => {
    const html = renderMarkup(<PivotHeader title="start" />);
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<p');
  });
});

describe('PageShell and TileGrid', () => {
  it('gives the page a skip link, one main landmark and an optional footer', () => {
    const html = renderMarkup(
      <PageShell header={<PivotHeader title="t" />} footer="as of now">
        <TileGrid label="Tiles">
          <Tile title="A" />
        </TileGrid>
      </PageShell>,
    );
    expect(html).toContain('href="#main"');
    expect(html).toContain('Skip to content');
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('id="main"');
    expect(html).toContain('<footer');
    expect(html).toContain('role="group" aria-label="Tiles"');
  });

  it('leaves the footer out when none is given', () => {
    const html = renderMarkup(
      <PageShell header={null}>
        <TileGrid>
          <Tile title="A" />
        </TileGrid>
      </PageShell>,
    );
    expect(html).not.toContain('<footer');
    expect(html).not.toContain('role="group"');
  });
});
