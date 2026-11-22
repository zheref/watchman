import { describe, expect, it } from 'vitest';
import { renderMarkup } from '@/test/render';
import Home from './page';
import ThemePreview from './theme/page';

describe('home placeholder', () => {
  it('renders the shared shell, a no-data tile and a link to the preview', () => {
    const html = renderMarkup(<Home />);
    expect(html).toMatch(/<h1[^>]*>start<\/h1>/);
    expect(html).toContain('data-state="no-data"');
    expect(html).toMatch(/<a[^>]*href="\/theme"/);
    expect(html).toContain('<span aria-hidden="true">→</span>');
  });
});

describe('/theme preview', () => {
  const html = renderMarkup(<ThemePreview />);

  it('renders the four tiles from the synthetic fixture, labelled synthetic', () => {
    for (const title of ['Attention', 'Flow', 'Spend', 'Metrics']) {
      expect(html).toMatch(new RegExp(`<h2 id="[^"]+"[^>]*>${title}</h2>`));
    }
    expect(html).toContain('Synthetic data');
  });

  it('links each of the top five attention items to its deep link', () => {
    const links = html.match(/href="https:\/\/example\.com\/[^"]+"/g) ?? [];
    expect(links).toHaveLength(5);
    expect(links[0]).toBe('href="https://example.com/orchard/cards/7"');
  });

  it('shows the metrics tile as no data and the spend total as partial and pluralised', () => {
    expect(html).toContain('no scorecard source exists yet');
    expect(html).toContain('1 provider without a reading');
    expect(html).toContain('stale over 3 days');
  });

  it('marks theme as the current pivot and links back to start', () => {
    expect(html).toMatch(/href="\/theme"[^>]*aria-current="page"/);
    expect(html).toMatch(/<a[^>]*href="\/"/);
  });
});
