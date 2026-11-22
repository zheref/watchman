'use client';

import { chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The start-screen grid tiles sit on: two columns on a phone, as many 9.5rem cells as fit from a
 * tablet up, packed densely so wide and large tiles leave no holes.
 */
export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <chakra.div
      role={label === undefined ? undefined : 'group'}
      aria-label={label}
      display="grid"
      gridTemplateColumns={{
        base: 'repeat(2, minmax(0, 1fr))',
        md: 'repeat(auto-fill, minmax({sizes.tile.cell}, 1fr))',
      }}
      gridAutoRows="minmax({sizes.tile.cell}, auto)"
      gridAutoFlow="row dense"
      gap="2"
    >
      {children}
    </chakra.div>
  );
}
