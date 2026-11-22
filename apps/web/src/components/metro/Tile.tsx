'use client';

import { chakra } from '@chakra-ui/react';
import { useId, type ReactNode } from 'react';
import type { Accent } from '@/theme/palette';
import { Provenance, type ProvenanceStamp } from './Provenance';
import { useSlots } from './use-slots';

type TileSlot = 'root' | 'header' | 'title' | 'value' | 'caption' | 'body' | 'footer' | 'state';

export type TileSize = 'small' | 'wide' | 'large';

export interface TileProps {
  /** The tile's name, shown top-left and used as its accessible name. */
  title: string;
  size?: TileSize;
  accent?: Accent;
  /** The big figure. Ignored when `noData` is set. */
  value?: ReactNode;
  /** One short line under the figure. */
  caption?: ReactNode;
  /** Extra content under the caption, e.g. a short ranked list. */
  children?: ReactNode;
  /** Where the figures came from and when they were true. */
  provenance?: ProvenanceStamp;
  /** Replaces the provenance line in the footer slot. */
  footer?: ReactNode;
  /**
   * Marks the tile as having no data: it turns neutral grey, says "No data" and gives the reason.
   * Never pass a zero or placeholder value instead.
   */
  noData?: { reason: string };
  /** Turns the whole tile into a link (then `children` must hold no links of its own). */
  href?: string;
  /**
   * Makes the title a link whose hit area stretches over the whole tile, while links inside
   * `children` stay their own targets above it. Use instead of `href` when the tile holds links.
   */
  titleHref?: string;
  /** Extra words read after the title in the title link, e.g. "details". */
  titleHrefHint?: string;
  /** A short badge top-right, e.g. "manual" or "partial". */
  badge?: string;
  /** Position in the grid, used to stagger the entrance animation (capped at 300 ms). */
  index?: number;
  /** Heading level of the title within the page; 2 by default. */
  headingLevel?: 2 | 3;
}

/**
 * The title link's `::after` covers the tile, so the whole tile is the target; the tile's own
 * links (`a` inside the body) are lifted above it. The focus ring is drawn on the cover, so it
 * outlines the whole tile.
 */
const STRETCHED_LINK = {
  color: 'inherit',
  textDecoration: 'none',
  outline: 'none',
  '&::after': { content: '""', position: 'absolute', inset: '0', zIndex: 0 },
  '&:focus-visible::after': {
    outlineWidth: '3px',
    outlineStyle: 'solid',
    outlineColor: 'focusRing',
    outlineOffset: '3px',
  },
  '&:hover': { textDecoration: 'underline' },
} as const;

/** The Metro tile: flat colour, square corners, a big light figure and its provenance. */
export function Tile({
  title,
  size = 'small',
  accent = 'cobalt',
  value,
  caption,
  children,
  provenance,
  footer,
  noData,
  href,
  titleHref,
  titleHrefHint,
  badge,
  index = 0,
  headingLevel = 2,
}: TileProps) {
  const titleId = useId();
  const missing = noData !== undefined;
  const styles = useSlots<TileSlot>('metroTile', {
    size,
    accent,
    state: missing ? 'noData' : 'value',
  });
  const Heading = headingLevel === 2 ? chakra.h2 : chakra.h3;
  const Root = href === undefined ? chakra.article : chakra.a;

  return (
    <Root
      css={styles.root}
      {...(href === undefined ? { 'aria-labelledby': titleId } : { href })}
      data-part="root"
      data-size={size}
      data-state={missing ? 'no-data' : 'value'}
      style={{ animationDelay: `${Math.min(index, 5) * 60}ms` }}
    >
      <chakra.div css={styles.header}>
        <Heading id={titleId} css={styles.title} data-part="title" m="0">
          {titleHref === undefined || href !== undefined ? (
            title
          ) : (
            <chakra.a href={titleHref} css={STRETCHED_LINK} data-part="title-link">
              {title}
              {titleHrefHint === undefined ? null : (
                <chakra.span srOnly>{` ${titleHrefHint}`}</chakra.span>
              )}
              <chakra.span aria-hidden="true" ms="1">
                ›
              </chakra.span>
            </chakra.a>
          )}
        </Heading>
        {badge === undefined ? null : (
          <chakra.span css={styles.state} data-part="badge">
            {badge}
          </chakra.span>
        )}
      </chakra.div>

      <chakra.div
        css={
          titleHref === undefined
            ? styles.body
            : { ...styles.body, '& a': { position: 'relative', zIndex: 1 } }
        }
        data-part="body"
      >
        {missing ? (
          <>
            <chakra.p css={styles.value} data-part="value" m="0">
              No data
            </chakra.p>
            <chakra.p css={styles.caption} data-part="caption" m="0">
              {noData.reason}
            </chakra.p>
          </>
        ) : (
          <>
            {value === undefined ? null : (
              <chakra.p css={styles.value} data-part="value" m="0">
                {value}
              </chakra.p>
            )}
            {caption === undefined ? null : (
              <chakra.p css={styles.caption} data-part="caption" m="0">
                {caption}
              </chakra.p>
            )}
            {children}
          </>
        )}
      </chakra.div>

      {footer === undefined && provenance === undefined ? null : (
        <chakra.p css={styles.footer} data-part="footer" m="0">
          {footer ?? (provenance === undefined ? null : <Provenance {...provenance} />)}
        </chakra.p>
      )}
    </Root>
  );
}
