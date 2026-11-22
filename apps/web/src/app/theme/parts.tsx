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
