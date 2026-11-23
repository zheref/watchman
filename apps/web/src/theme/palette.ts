/**
 * The Metro palette. The accents are the classic Modern UI tile colours, darkened where the
 * original failed WCAG AA with white text, so every tile reads at 4.5:1 or better
 * (`contrast.test.ts` proves it). Plain data with no Chakra import, so tests and other surfaces
 * can read it.
 */

/** Tile accents: white text on each meets WCAG AA for normal-size text. */
export const ACCENTS = {
  cobalt: '#0050EF',
  blue: '#0063B1',
  teal: '#00827F',
  emerald: '#007A00',
  green: '#3A7A0A',
  amber: '#9E6A00',
  orange: '#C24E00',
  red: '#C50F00',
  crimson: '#A20025',
  magenta: '#C3006A',
  violet: '#8E00D6',
  indigo: '#6A00FF',
  mauve: '#76608A',
  steel: '#556677',
  brown: '#825A2C',
} as const;

export type Accent = keyof typeof ACCENTS;
export const ACCENT_NAMES = Object.keys(ACCENTS) as Accent[];

/** The dark Modern UI canvas and its text. */
export const NEUTRALS = {
  canvas: '#141414',
  surface: '#1F1F1F',
  /** The "no data" tile: a flat grey that never reads as a real accent. */
  noData: '#333333',
  noDataStripe: '#3B3B3B',
  fg: '#FFFFFF',
  fgMuted: '#B8B8B8',
  /** Inactive pivot items: dimmer than muted, still AA on the canvas. */
  fgSubtle: '#949494',
  border: '#3D3D3D',
  focus: '#FFFFFF',
} as const;

/** Text colour used on every tile. */
export const TILE_FG = NEUTRALS.fg;

/**
 * A Segoe-like stack: Segoe UI where installed (Windows), Selawik (Microsoft's open Segoe
 * metric-compatible fallback) where installed, then Open Sans, which the app self-hosts at build
 * time (SIL Open Font Licence), then the platform UI font.
 */
export const FONT_STACK = [
  '"Segoe UI"',
  '"Segoe UI Web (West European)"',
  'Selawik',
  'var(--font-open-sans)',
  '"Open Sans"',
  '-apple-system',
  'BlinkMacSystemFont',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(', ');

export const MONO_STACK = [
  '"Cascadia Mono"',
  'Consolas',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'monospace',
].join(', ');

// --- WCAG 2.x contrast -----------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`expected #RRGGBB, got ${hex}`);
  const [r, g, b] = match.slice(1).map((h) => channel(parseInt(h, 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA minimum for normal-size text. */
export const AA_NORMAL = 4.5;
