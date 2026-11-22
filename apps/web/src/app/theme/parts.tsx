'use client';

import { chakra, type HTMLChakraProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/** A titled section of the preview, with a light lower-case subheader. */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <chakra.section aria-labelledby={`${id}-title`} mt="12" scrollMarginTop="6">
      <chakra.h2
        id={`${id}-title`}
        textStyle="metro.subheader"
        textTransform="lowercase"
        m="0"
        mb="4"
      >
        {title}
      </chakra.h2>
      <chakra.div id={id} display="flex" flexDirection="column" gap="3">
        {children}
      </chakra.div>
    </chakra.section>
  );
}

/** Plain text on a text style; `as` picks the element. */
export function Specimen({ as = 'div', ...props }: HTMLChakraProps<'div'> & { as?: 'div' | 'p' }) {
  const Element = as === 'p' ? chakra.p : chakra.div;
  return <Element m="0" {...(props as HTMLChakraProps<'p'>)} />;
}

export interface TileListItem {
  key: string;
  label: string;
  meta: string;
  href?: string;
}

/** A short list inside a tile: label over a caption line, each optionally a deep link. */
export function TileList({ items }: { items: TileListItem[] }) {
  return (
    <chakra.ol listStyle="none" m="0" p="0" display="flex" flexDirection="column" gap="2" mt="2">
      {items.map((item) => (
        <chakra.li key={item.key} m="0" minWidth="0">
          {item.href === undefined ? (
            <chakra.span display="block" textStyle="metro.label">
              {item.label}
            </chakra.span>
          ) : (
            <chakra.a
              href={item.href}
              display="block"
              textStyle="metro.label"
              color="inherit"
              textDecoration="underline"
              textUnderlineOffset="3px"
              minHeight="6"
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'focusRing',
                outlineOffset: '2px',
              }}
            >
              {item.label}
            </chakra.a>
          )}
          <chakra.span display="block" textStyle="metro.caption">
            {item.meta}
          </chakra.span>
        </chakra.li>
      ))}
    </chakra.ol>
  );
}
