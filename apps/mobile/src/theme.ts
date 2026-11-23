import { Platform } from 'react-native';
import { COLORS } from './palette';

export { COLORS };

/** The type scale, in dp; React Native scales it with the user's text-size setting. */
export const TYPE = {
  /** The pivot header's big light title. */
  pivot: 44,
  /** The tile's headline figure. */
  figure: 72,
  /** A row's rank numeral. */
  rank: 32,
  /** Titles, captions and every line of a row's detail: the body size. */
  body: 16,
  /** Stamps, footers and badges. */
  small: 14,
} as const;

/** Line height as a multiple of the font size, for running text (UX-8 asks for 1.4 to 1.6). */
export const LINE = { body: 1.4, display: 1.1 } as const;

/** Line height in dp for `size`. */
export const lineHeight = (size: number, ratio: number = LINE.body) => Math.round(size * ratio);

/** Segoe is not on phones: the platform's light and regular system faces carry the same look. */
export const FONT = {
  // iOS weight 200 is Thin; 300 is Light, the same face as Android's `sans-serif-light`.
  light: Platform.select({
    android: { fontFamily: 'sans-serif-light', fontWeight: '300' as const },
    default: { fontWeight: '300' as const },
  }),
  regular: Platform.select({
    android: { fontFamily: 'sans-serif', fontWeight: '400' as const },
    default: { fontWeight: '400' as const },
  }),
  semibold: Platform.select({
    android: { fontFamily: 'sans-serif-medium', fontWeight: '500' as const },
    default: { fontWeight: '600' as const },
  }),
};

/** Spacing steps, in dp. */
export const SPACE = { hair: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Letter-spacing steps, in dp. */
export const TRACK = { tight: 0.4, wide: 1, wider: 2 } as const;

/** The smallest touch target a row may have (Android 48dp, iOS 44pt). */
export const MIN_TARGET = 48;

/** The widest the content grows: a phone fills the screen, a tablet keeps a readable column. */
export const MAX_CONTENT_WIDTH = 640;
