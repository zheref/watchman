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

  it('contrast is symmetric and 1 for equal colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBe(1);
  });

  it('refuses a colour that is not #RRGGBB', () => {
    expect(() => contrastRatio('red', COLORS.fg)).toThrow(RangeError);
  });
});
