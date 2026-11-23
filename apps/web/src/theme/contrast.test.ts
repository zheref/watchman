import { describe, expect, it } from 'vitest';
import {
  AA_NORMAL,
  ACCENTS,
  ACCENT_NAMES,
  NEUTRALS,
  TILE_FG,
  contrastRatio,
  luminance,
} from './palette';

describe('contrast (WCAG 2.x AA, 4.5:1 for normal text)', () => {
  it.each(ACCENT_NAMES)('white tile text on the %s accent passes', (name) => {
    expect(contrastRatio(TILE_FG, ACCENTS[name])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each([
    ['fg', NEUTRALS.fg],
    ['fgMuted', NEUTRALS.fgMuted],
    ['fgSubtle (inactive pivot)', NEUTRALS.fgSubtle],
  ])('%s on the canvas and on the panel passes', (_name, colour) => {
    expect(contrastRatio(colour, NEUTRALS.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(colour, NEUTRALS.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('white text on both stripes of the no-data tile passes', () => {
    expect(contrastRatio(TILE_FG, NEUTRALS.noData)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(TILE_FG, NEUTRALS.noDataStripe)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the focus ring stands out from the canvas (3:1 for UI components)', () => {
    expect(contrastRatio(NEUTRALS.focus, NEUTRALS.canvas)).toBeGreaterThanOrEqual(3);
  });

  it('computes the reference ratios', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(luminance('#FFFFFF')).toBe(1);
    expect(() => luminance('white')).toThrow(RangeError);
  });

  it('keeps every accent distinct', () => {
    expect(new Set(Object.values(ACCENTS)).size).toBe(ACCENT_NAMES.length);
  });
});
