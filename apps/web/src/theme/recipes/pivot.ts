import { defineSlotRecipe } from '@chakra-ui/react';

/**
 * The panorama / pivot header: an oversized, light, lower-case title with the pivot items
 * beneath it, the current one full-strength and the others dimmed (still AA on the canvas).
 */
export const pivotRecipe = defineSlotRecipe({
  className: 'metro-pivot',
  slots: ['root', 'eyebrow', 'title', 'list', 'item', 'link'],
  base: {
    root: { display: 'flex', flexDirection: 'column', gap: '2', pb: '6' },
    eyebrow: {
      fontSize: 'sm',
      fontWeight: 'semibold',
      textTransform: 'uppercase',
      letterSpacing: 'widest',
      color: 'fg.muted',
    },
    title: {
      fontSize: { base: '5xl', md: '7xl' },
      fontWeight: 'light',
      lineHeight: '1',
      letterSpacing: 'tight',
      textTransform: 'lowercase',
      color: 'fg',
      _motionSafe: {
        animationName: 'metro-slide-in',
        animationDuration: 'slower',
        animationTimingFunction: 'metro',
        animationFillMode: 'backwards',
      },
    },
    list: {
      display: 'flex',
      flexWrap: 'wrap',
      columnGap: { base: '5', md: '8' },
      rowGap: '1',
      listStyle: 'none',
      m: '0',
      p: '0',
    },
    item: { m: '0' },
    link: {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: '11',
      fontSize: { base: '2xl', md: '3xl' },
      fontWeight: 'light',
      textTransform: 'lowercase',
      color: 'pivot.inactive',
      textDecoration: 'none',
      outline: 'none',
      _hover: { color: 'fg' },
      _focusVisible: {
        outlineWidth: '3px',
        outlineStyle: 'solid',
        outlineColor: 'focusRing',
        outlineOffset: '2px',
      },
      '&[aria-current]': { color: 'fg' },
    },
  },
});
