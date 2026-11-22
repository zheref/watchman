'use client';

import { chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export interface TileListItem {
  key: string;
  label: string;
  meta: ReactNode;
  href?: string;
  /** Read after the label inside the link, e.g. "opens github.com". */
  hrefHint?: string;
}

/**
 * A short list inside a tile: label over a caption line. A linked item makes the whole row the
 * link, at least 44 px tall (UX-3), so the target is the full row, not just the label's text.
 */
export function TileList({ items }: { items: TileListItem[] }) {
  return (
    <chakra.ol listStyle="none" m="0" p="0" display="flex" flexDirection="column" gap="1" mt="2">
      {items.map((item) => {
        const body = (
          <>
            <chakra.span display="block" textStyle="metro.label">
              {item.label}
              {item.hrefHint === undefined ? null : (
                <chakra.span srOnly>{` (${item.hrefHint})`}</chakra.span>
              )}
            </chakra.span>
            <chakra.span display="block" textStyle="metro.caption">
              {item.meta}
            </chakra.span>
          </>
        );
        return (
          <chakra.li key={item.key} m="0" minWidth="0">
            {item.href === undefined ? (
              body
            ) : (
              <chakra.a
                href={item.href}
                display="flex"
                flexDirection="column"
                justifyContent="center"
                minHeight="11"
                py="1"
                color="inherit"
                textDecoration="none"
                css={{
                  '& > span:first-of-type': {
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  },
                }}
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'focusRing',
                  outlineOffset: '2px',
                }}
              >
                {body}
              </chakra.a>
            )}
          </chakra.li>
        );
      })}
    </chakra.ol>
  );
}
