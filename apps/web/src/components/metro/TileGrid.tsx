'use client';

import { chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The start-screen grid tiles sit on: as many 10rem cells as fit (two on a phone), packed densely
 * so wide and large tiles leave no holes.
 */
export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <chakra.div
      role={label === undefined ? undefined : 'group'}
      aria-label={label}
      display="grid"
      // As many 10rem cells as fit, at least one. The cell is in rem, so enlarged text reflows the
      // grid to fewer, wider columns instead of squeezing tiles (WCAG 1.4.4, 1.4.10).
      gridTemplateColumns="repeat(auto-fill, minmax(min(100%, {sizes.tile.cell}), 1fr))"
      gridAutoRows="minmax({sizes.tile.cell}, auto)"
      gridAutoFlow="row dense"
      gap="2"
    >
      {children}
    </chakra.div>
  );
}
