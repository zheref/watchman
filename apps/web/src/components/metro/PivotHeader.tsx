'use client';

import { chakra } from '@chakra-ui/react';
import { useSlots } from './use-slots';

type PivotSlot = 'root' | 'eyebrow' | 'title' | 'list' | 'item' | 'link';

export interface PivotItem {
  label: string;
  href: string;
  /** The item for the view on screen; announced with `aria-current`. */
  current?: boolean;
}

export interface PivotHeaderProps {
  /** The page's heading, shown oversized and lower-case. */
  title: string;
  /** A small line above the title, e.g. the app name. */
  eyebrow?: string;
  items?: PivotItem[];
  /** Accessible name of the pivot navigation. */
  navLabel?: string;
}

/** The panorama / pivot header: a huge light title over a row of pivot links. */
export function PivotHeader({
  title,
  eyebrow,
  items = [],
  navLabel = 'Sections',
}: PivotHeaderProps) {
  const styles = useSlots<PivotSlot>('metroPivot');
  return (
    <chakra.header css={styles.root}>
      {eyebrow === undefined ? null : (
        <chakra.p css={styles.eyebrow} m="0">
          {eyebrow}
        </chakra.p>
      )}
      <chakra.h1 css={styles.title} m="0">
        {title}
      </chakra.h1>
      {items.length === 0 ? null : (
        <chakra.nav aria-label={navLabel}>
          <chakra.ul css={styles.list}>
            {items.map((item) => (
              <chakra.li key={item.href} css={styles.item}>
                <chakra.a
                  css={styles.link}
                  href={item.href}
                  aria-current={item.current === true ? 'page' : undefined}
                >
                  {item.label}
                </chakra.a>
              </chakra.li>
            ))}
          </chakra.ul>
        </chakra.nav>
      )}
    </chakra.header>
  );
}
