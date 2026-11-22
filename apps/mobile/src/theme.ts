import { Platform } from 'react-native';
import { COLORS } from './palette';

export { COLORS };

/** The type scale, in dp; React Native scales it with the user's text-size setting. */
export const TYPE = {
  /** The pivot header's big light title. */
  pivot: 44,
  /** The tile's headline figure. */
  figure: 72,
  caption: 16,
  title: 17,
  meta: 14,
  small: 13,
} as const;

/** Segoe is not on phones: the platform's light and regular system faces carry the same look. */
export const FONT = {
  light: Platform.select({
    android: { fontFamily: 'sans-serif-light', fontWeight: '300' as const },
    default: { fontWeight: '200' as const },
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
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The smallest touch target a row may have (Android 48dp, iOS 44pt). */
export const MIN_TARGET = 48;
