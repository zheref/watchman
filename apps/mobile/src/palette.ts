/**
 * The Metro colours: a dark canvas and flat tile colours. They are the web dashboard's (`apps/web/src/theme/palette.ts`), copied
 * rather than imported so the app does not depend on the web app; `palette.test.ts` proves the
 * text colours keep WCAG AA contrast against the tile and the canvas. Plain data, no React Native
 * import, so tests can read it.
 */
export const COLORS = {
  canvas: '#141414',
  /** The Attention tile's accent: white text on it is 6.2:1. */
  cobalt: '#0050EF',
  /** The "no data" tile: a flat grey that never reads as a real accent. */
  noData: '#333333',
  fg: '#FFFFFF',
  fgMuted: '#B8B8B8',
  /** Hairlines on a tile: a white at 60% (3.1:1 over cobalt). Decoration only; no text uses it. */
  rule: 'rgba(255, 255, 255, 0.6)',
  /** A pressed row: the tile darkened, which only raises the white text's contrast. */
  pressed: 'rgba(0, 0, 0, 0.2)',
  /** The keyboard-focus outline on a row (white on cobalt is 6.2:1, over the 3:1 non-text bar). */
  focus: '#FFFFFF',
} as const;

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`expected #RRGGBB, got ${hex}`);
  const [r, g, b] = match.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
