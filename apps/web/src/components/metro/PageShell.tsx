'use client';

import { chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export interface PageShellProps {
  /** Usually a `PivotHeader`. */
  header: ReactNode;
  children: ReactNode;
  /** Optional footer content, e.g. the snapshot's as-of stamp. */
  footer?: ReactNode;
}

/**
 * The page frame every view shares: a skip link, the header, one `main` landmark and a footer,
 * on the Metro canvas with generous left padding, as on the Modern UI start screen.
 */
export function PageShell({ header, children, footer }: PageShellProps) {
  return (
    <chakra.div minHeight="100dvh" bg="bg" color="fg">
      <chakra.a
        href="#main"
        position="absolute"
        left="4"
        top="-20"
        zIndex="skipNav"
        px="4"
        py="3"
        bg="fg"
        color="bg"
        fontWeight="semibold"
        _focusVisible={{
          top: '4',
          outline: '3px solid',
          outlineColor: 'focusRing',
          outlineOffset: '2px',
        }}
      >
        Skip to content
      </chakra.a>
      <chakra.div
        maxWidth="96rem"
        mx="auto"
        px={{ base: '4', md: '10', xl: '16' }}
        pt={{ base: '6', md: '10' }}
        pb="16"
      >
        {header}
        <chakra.main id="main" tabIndex={-1} outline="none">
          {children}
        </chakra.main>
        {footer === undefined ? null : (
          <chakra.footer mt="12" textStyle="metro.caption" color="fg.muted">
            {footer}
          </chakra.footer>
        )}
      </chakra.div>
    </chakra.div>
  );
}
