import { createSystem, defaultConfig, defineConfig, defineTextStyles } from '@chakra-ui/react';
import { ACCENTS, FONT_STACK, MONO_STACK, NEUTRALS, type Accent } from './palette';
import { pivotRecipe } from './recipes/pivot';
import { tileRecipe } from './recipes/tile';

/**
 * Watchman's Chakra UI v3 system: the Metro / Modern UI look as tokens, semantic tokens, text
 * styles and recipes, layered on Chakra's default config. Components read semantic tokens
 * (`fg`, `bg`, `tile.*`, `pivot.*`), never raw colours, so a later light scheme only has to
 * change this file.
 */

const accentTokens = Object.fromEntries(
  Object.entries(ACCENTS).map(([name, value]) => [name, { value }]),
) as Record<Accent, { value: string }>;

const accentSemantic = Object.fromEntries(
  Object.keys(ACCENTS).map((name) => [name, { value: `{colors.metro.${name}}` }]),
) as Record<Accent, { value: string }>;

/** Square corners everywhere: every radius token is zero. */
const SQUARE = { value: '0' };
const radii = Object.fromEntries(
  ['none', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].map((k) => [k, SQUARE]),
);

/** The Modern UI type ramp: big and light at the top, small and semibold for labels. */
const textStyles = defineTextStyles({
  'metro.header': {
    value: {
      fontSize: { base: '5xl', md: '7xl' },
      fontWeight: 'light',
      lineHeight: '1',
      letterSpacing: 'tight',
    },
  },
  'metro.subheader': {
    value: { fontSize: { base: '2xl', md: '3xl' }, fontWeight: 'light', lineHeight: 'shorter' },
  },
  'metro.title': { value: { fontSize: 'xl', fontWeight: 'normal', lineHeight: 'short' } },
  'metro.body': { value: { fontSize: 'md', fontWeight: 'normal', lineHeight: 'tall' } },
  'metro.label': {
    value: { fontSize: 'sm', fontWeight: 'semibold', letterSpacing: 'wide', lineHeight: 'short' },
  },
  'metro.caption': { value: { fontSize: 'sm', letterSpacing: 'wide', lineHeight: 'moderate' } },
});

const config = defineConfig({
  globalCss: {
    'html, body': { bg: 'bg', color: 'fg', fontFamily: 'body' },
    '::selection': { bg: 'tile.cobalt', color: 'tile.fg' },
    // Belt and braces beside every recipe's `_motionSafe`: no motion for anyone who asked for none.
    '*, *::before, *::after': {
      _motionReduce: {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      },
    },
  },
  theme: {
    tokens: {
      colors: {
        metro: {
          ...accentTokens,
          ...Object.fromEntries(Object.entries(NEUTRALS).map(([k, v]) => [k, { value: v }])),
        },
      },
      fonts: {
        heading: { value: FONT_STACK },
        body: { value: FONT_STACK },
        mono: { value: MONO_STACK },
      },
      radii,
      sizes: {
        tile: { cell: { value: '10rem' }, large: { value: '20.5rem' } },
      },
      easings: {
        // The Modern UI "exponential out" curve: quick start, long settle.
        metro: { value: 'cubic-bezier(0.1, 0.9, 0.2, 1)' },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: { value: '{colors.metro.canvas}' },
          panel: { value: '{colors.metro.surface}' },
        },
        fg: {
          DEFAULT: { value: '{colors.metro.fg}' },
          muted: { value: '{colors.metro.fgMuted}' },
          subtle: { value: '{colors.metro.fgSubtle}' },
        },
        border: { DEFAULT: { value: '{colors.metro.border}' } },
        focusRing: { value: '{colors.metro.focus}' },
        tile: {
          fg: { value: '{colors.metro.fg}' },
          noData: { value: '{colors.metro.noData}' },
          noDataStripe: { value: '{colors.metro.noDataStripe}' },
          ...accentSemantic,
        },
        pivot: { inactive: { value: '{colors.metro.fgSubtle}' } },
      },
      radii: { l1: SQUARE, l2: SQUARE, l3: SQUARE },
    },
    textStyles,
    keyframes: {
      // Tiles swing in like the start screen's turnstile; headers slide in from the right.
      'metro-turnstile': {
        from: {
          opacity: '0',
          transform: 'perspective(60rem) rotateY(-24deg) translateX(-0.75rem)',
        },
        to: { opacity: '1', transform: 'none' },
      },
      'metro-slide-in': {
        from: { opacity: '0', transform: 'translateX(2.5rem)' },
        to: { opacity: '1', transform: 'none' },
      },
    },
    slotRecipes: {
      metroTile: tileRecipe,
      metroPivot: pivotRecipe,
    },
  },
});

export const system = createSystem(defaultConfig, config);
