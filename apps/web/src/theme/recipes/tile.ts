import { defineSlotRecipe } from '@chakra-ui/react';
import { ACCENT_NAMES, type Accent } from '../palette';

/**
 * The Metro tile: a flat, square, single-colour block on the grid. Sizes follow the Modern UI
 * start screen — small (1×1), wide (2×1) and large (2×2) grid cells — and the content sits
 * bottom-left: a light, oversized value above a small title, with the source and as-of stamp
 * in the footer slot.
 */
const accentVariants = Object.fromEntries(
  ACCENT_NAMES.map((name) => [name, { root: { bg: `tile.${name}` } }]),
) as Record<Accent, { root: { bg: string } }>;

export const tileRecipe = defineSlotRecipe({
  className: 'metro-tile',
  slots: ['root', 'header', 'title', 'value', 'caption', 'body', 'footer', 'state'],
  base: {
    root: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '2',
      minWidth: '0',
      p: '4',
      color: 'tile.fg',
      borderRadius: 'none',
      overflow: 'hidden',
      // The figure sizes itself against the tile's own width (cqi), so enlarged text shrinks the
      // figure before it would overflow the tile.
      containerType: 'inline-size',
      textDecoration: 'none',
      outline: 'none',
      transformOrigin: 'center',
      _motionSafe: {
        animationName: 'metro-turnstile',
        animationDuration: 'slow',
        animationTimingFunction: 'metro',
        animationFillMode: 'backwards',
        transitionProperty: 'transform',
        transitionDuration: 'fast',
        transitionTimingFunction: 'metro',
        _active: { transform: 'scale(0.97)' },
      },
      // Pressed and hover cues that do not depend on motion (reduced-motion users get them too).
      // Darkening only raises the white text's contrast; the hover cue is an inset white edge.
      _active: { filter: 'brightness(0.85)' },
      '&:is(a):hover': { boxShadow: 'inset 0 0 0 2px {colors.tile.fg}' },
      _focusVisible: {
        outlineWidth: '3px',
        outlineStyle: 'solid',
        outlineColor: 'focusRing',
        outlineOffset: '3px',
      },
      _hover: { '& [data-part=title]': { textDecoration: 'underline' } },
    },
    header: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '2',
    },
    title: {
      fontSize: 'sm',
      fontWeight: 'semibold',
      letterSpacing: 'wide',
      lineHeight: 'short',
    },
    state: {
      fontSize: 'xs',
      fontWeight: 'semibold',
      textTransform: 'uppercase',
      letterSpacing: 'wider',
      px: '1.5',
      py: '0.5',
      borderWidth: '1px',
      borderColor: 'tile.fg',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    body: { display: 'flex', flexDirection: 'column', gap: '1', minWidth: '0' },
    value: {
      fontWeight: 'light',
      lineHeight: '1',
      // A figure never breaks mid-number; the global wrap rule would split "$10.00".
      overflowWrap: 'normal',
      wordBreak: 'keep-all',
      letterSpacing: 'tight',
      fontVariantNumeric: 'tabular-nums',
    },
    caption: { fontSize: 'md', lineHeight: 'moderate' },
    footer: {
      fontSize: 'sm',
      lineHeight: 'moderate',
      letterSpacing: 'wide',
      overflowWrap: 'anywhere',
    },
  },
  variants: {
    size: {
      small: {
        root: { gridColumn: 'span 1', gridRow: 'span 1', minHeight: 'tile.cell' },
        value: { fontSize: 'min({fontSizes.4xl}, 24cqi)' },
      },
      wide: {
        root: {
          // Full row on narrow grids (which may be one column when text is enlarged), two cells
          // from a tablet up.
          gridColumn: { base: '1 / -1', md: 'span 2' },
          gridRow: 'span 1',
          minHeight: 'tile.cell',
        },
        value: { fontSize: 'min({fontSizes.5xl}, 18cqi)' },
      },
      large: {
        root: {
          gridColumn: { base: '1 / -1', md: 'span 2' },
          gridRow: 'span 2',
          minHeight: 'tile.large',
        },
        value: { fontSize: 'min({fontSizes.6xl}, 24cqi)' },
      },
    },
    accent: accentVariants,
    state: {
      value: {},
      noData: {
        root: {
          bg: 'tile.noData',
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent 0 12px, {colors.tile.noDataStripe} 12px 24px)',
        },
        value: { fontSize: '2xl', fontWeight: 'normal' },
      },
    },
  },
  defaultVariants: { size: 'small', accent: 'cobalt', state: 'value' },
});
