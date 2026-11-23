import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tile } from './metro';
import { ThemeProvider } from './theme-provider';

describe('ThemeProvider', () => {
  it('supplies the Metro system to what it wraps', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <Tile title="Wrapped" accent="teal" value={1} />
      </ThemeProvider>,
    );
    expect(html).toContain('Wrapped');
    expect(html).toContain('--chakra-colors-tile-teal');
  });
});
