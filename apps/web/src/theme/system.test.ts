import { describe, expect, it } from 'vitest';
import { ACCENT_NAMES } from './palette';
import { system } from './system';

describe('the Metro system', () => {
  it('squares every corner', () => {
    for (const key of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) {
      expect(system.token(`radii.${key}`)).toBe('0');
    }
    // Chakra's own components round through the semantic l1–l3 radii; those are zero too.
    const semantic = system._config.theme?.semanticTokens?.radii as Record<
      string,
      { value: string }
    >;
    for (const key of ['l1', 'l2', 'l3']) expect(semantic[key]?.value).toBe('0');
  });

  it('uses the Segoe-like stack for body and headings', () => {
    expect(system.token('fonts.body')).toMatch(/^"Segoe UI".*Selawik.*Open Sans/);
    expect(system.token('fonts.heading')).toBe(system.token('fonts.body'));
  });

  it('registers the tile and pivot recipes with every accent', () => {
    expect(system.isSlotRecipe('metroTile')).toBe(true);
    expect(system.isSlotRecipe('metroPivot')).toBe(true);
    const tile = system.getSlotRecipe('metroTile');
    expect(Object.keys(tile?.variants?.accent ?? {}).sort()).toEqual([...ACCENT_NAMES].sort());
  });

  it('exposes the type ramp as text styles', () => {
    expect(Object.keys(system._config.theme?.textStyles ?? {})).toEqual(
      expect.arrayContaining(['metro.header', 'metro.subheader', 'metro.label', 'metro.caption']),
    );
  });
});
