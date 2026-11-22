import { describe, expect, it } from 'vitest';
import { COLORS, contrastRatio } from './palette';

const AA_NORMAL = 4.5;

describe('the Metro palette keeps WCAG AA contrast for text', () => {
  it('white on the cobalt Attention tile', () => {
    expect(contrastRatio(COLORS.fg, COLORS.cobalt)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('white on the grey "no data" tile', () => {
    expect(contrastRatio(COLORS.fg, COLORS.noData)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('white and muted text on the canvas', () => {
    expect(contrastRatio(COLORS.fg, COLORS.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(COLORS.fgMuted, COLORS.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the focus outline and the hairline rules clear the 3:1 non-text bar on the tile', () => {
    expect(contrastRatio(COLORS.focus, COLORS.cobalt)).toBeGreaterThanOrEqual(3);
    // The rule is white at 60% over cobalt: blend it the way the screen does.
    const blend = (c: number) => Math.round(0.6 * 255 + 0.4 * c);
    const hex = [0x00, 0x50, 0xef].map((c) => blend(c).toString(16).padStart(2, '0')).join('');
    expect(contrastRatio(`#${hex}`, COLORS.cobalt)).toBeGreaterThanOrEqual(3);
  });

  it('contrast is symmetric and 1 for equal colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBe(1);
  });

  it('refuses a colour that is not #RRGGBB', () => {
    expect(() => contrastRatio('red', COLORS.fg)).toThrow(RangeError);
  });
});
