'use client';

import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { system } from '@/theme/system';

/** Supplies the Metro Chakra system to every client component below the root layout. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
