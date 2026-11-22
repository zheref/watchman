'use client';

import { useSlotRecipe, type SystemStyleObject } from '@chakra-ui/react';

/**
 * Reads one of the system's registered slot recipes (`theme.slotRecipes` in `theme/system.ts`)
 * and returns the styles for each slot. The recipe is looked up by key, so the theme stays the
 * one place a tile or pivot is styled.
 */
export function useSlots<Slot extends string>(
  key: 'metroTile' | 'metroPivot',
  variants: Record<string, string | undefined> = {},
): Record<Slot, SystemStyleObject> {
  const recipe = useSlotRecipe({ key });
  return recipe(variants) as Record<Slot, SystemStyleObject>;
}
