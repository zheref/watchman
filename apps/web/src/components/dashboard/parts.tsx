'use client';

import { chakra, type HTMLChakraProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { SourceStatusRecord } from '@watchman/core';
import { Provenance, type ProvenanceStamp } from '@/components/metro';

/**
 * Presentational pieces the dashboard's server pages compose: sections, tables, stamps, badges
 * and notices in the Metro style. Client components only because Chakra styles through context;
 * they hold no state and fetch nothing.
 */

/** A titled block of a drill-down, with a light lower-case subheader. */
export function DetailSection({
  id,
  title,
  children,
  stamp,
}: {
  id: string;
  title: string;
  children: ReactNode;
  stamp?: ProvenanceStamp;
}) {
  return (
    <chakra.section aria-labelledby={`${id}-title`} mt="10">
      <chakra.h2
        id={`${id}-title`}
        textStyle="metro.subheader"
        textTransform="lowercase"
        m="0"
        mb="3"
      >
        {title}
      </chakra.h2>
      {children}
      {stamp === undefined ? null : (
        <chakra.p textStyle="metro.caption" color="fg.muted" mt="3" mb="0">
          <Provenance {...stamp} />
        </chakra.p>
      )}
    </chakra.section>
  );
}

/** A plain paragraph on a text style. */
export function Text(props: HTMLChakraProps<'p'>) {
  return <chakra.p m="0" {...props} />;
}

/** A small boxed badge: `synthetic`, `manual`, `partial`, `stale`. */
export function Badge({
  children,
  tone = 'plain',
}: {
  children: ReactNode;
  tone?: 'plain' | 'warn';
}) {
  return (
    <chakra.span
      display="inline-block"
      fontSize="xs"
      fontWeight="semibold"
      textTransform="uppercase"
      letterSpacing="wider"
      px="1.5"
      py="0.5"
      borderWidth="1px"
      borderColor="fg"
      bg={tone === 'warn' ? 'tile.amber' : 'transparent'}
      color="fg"
      whiteSpace="nowrap"
    >
      {children}
    </chakra.span>
  );
}

/** A flat notice under the header: what the page cannot show, or a caution about its age. */
export function Notice({ children, role }: { children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <chakra.p
      role={role}
      m="0"
      mt="3"
      px="4"
      py="3"
      bg="bg.panel"
      borderInlineStartWidth="4px"
      borderInlineStartColor="tile.amber"
      textStyle="metro.body"
    >
      {children}
    </chakra.p>
  );
}

/** The page's data stamp: one line under the pivot, wrapping on a phone. */
export function StatusBar({ children }: { children: ReactNode }) {
  return (
    <chakra.section
      aria-label="Data status"
      display="flex"
      flexWrap="wrap"
      alignItems="center"
      gap="2"
      columnGap="4"
      mt="2"
      mb="6"
      textStyle="metro.caption"
      color="fg.muted"
    >
      {children}
    </chakra.section>
  );
}

export interface Column {
  header: string;
  /** Right-aligns figures. */
  numeric?: boolean;
}

export interface Row {
  key: string;
  /** One cell per column, in column order. */
  cells: ReactNode[];
}

/**
 * A data table that scrolls inside itself on a narrow screen, so the page never scrolls sideways
 * (WCAG 1.4.10); the scroll area is focusable and named so a keyboard can reach it. Rows arrive
 * as rendered cells, because a server page cannot hand a client component a function.
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: Column[];
  rows: Row[];
}) {
  return (
    <chakra.div
      // Positioned, so visually hidden text inside (absolutely placed) scrolls with the table
      // instead of widening the page.
      position="relative"
      overflowX="auto"
      tabIndex={0}
      role="region"
      aria-label={caption}
      _focusVisible={{ outline: '2px solid', outlineColor: 'focusRing', outlineOffset: '2px' }}
    >
      <chakra.table width="100%" borderCollapse="collapse" textStyle="metro.body" minWidth="32rem">
        <chakra.caption srOnly>{caption}</chakra.caption>
        <chakra.thead>
          <chakra.tr>
            {columns.map((c) => (
              <chakra.th
                key={c.header}
                scope="col"
                textAlign={c.numeric === true ? 'end' : 'start'}
                textStyle="metro.label"
                color="fg.muted"
                py="2"
                px="3"
                borderBottomWidth="2px"
                borderColor="border"
              >
                {c.header}
              </chakra.th>
            ))}
          </chakra.tr>
        </chakra.thead>
        <chakra.tbody>
          {rows.map((row) => (
            <chakra.tr key={row.key} borderBottomWidth="1px" borderColor="border">
              {columns.map((c, i) => (
                <chakra.td
                  key={c.header}
                  textAlign={c.numeric === true ? 'end' : 'start'}
                  fontVariantNumeric={c.numeric === true ? 'tabular-nums' : undefined}
                  py="2"
                  px="3"
                  verticalAlign="top"
                >
                  {row.cells[i]}
                </chakra.td>
              ))}
            </chakra.tr>
          ))}
        </chakra.tbody>
      </chakra.table>
    </chakra.div>
  );
}

/** A link styled for the dark canvas: underlined, with a visible focus ring and a 44px row. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <chakra.a
      href={href}
      color="fg"
      textDecoration="underline"
      textUnderlineOffset="3px"
      display="inline-flex"
      alignItems="center"
      minHeight="11"
      _focusVisible={{ outline: '2px solid', outlineColor: 'focusRing', outlineOffset: '2px' }}
    >
      {children}
    </chakra.a>
  );
}

/** A flat meter: how much of a quota is used. The figure beside it carries the meaning. */
export function Meter({ percent, label }: { percent: number; label: string }) {
  const shown = Math.max(0, Math.min(100, percent));
  return (
    <chakra.div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={`${percent}%`}
      height="2"
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      mt="1"
      minWidth="6rem"
    >
      <chakra.div
        height="100%"
        width={`${shown}%`}
        bg={percent > 100 ? 'tile.red' : percent >= 80 ? 'tile.amber' : 'tile.teal'}
      />
    </chakra.div>
  );
}

/** A list of short lines inside a tile: no links, just facts. */
export function TileLines({ lines }: { lines: { key: string; text: ReactNode }[] }) {
  return (
    <chakra.ul listStyle="none" m="0" p="0" mt="2" display="flex" flexDirection="column" gap="0.5">
      {lines.map((l) => (
        <chakra.li key={l.key} textStyle="metro.caption" m="0">
          {l.text}
        </chakra.li>
      ))}
    </chakra.ul>
  );
}

/** Text only screen readers read, e.g. where a link goes. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <chakra.span srOnly>{children}</chakra.span>;
}

/** The way back from a drill-down to the four tiles. */
export function BackToStart() {
  return (
    <chakra.p m="0" mb="2">
      <TextLink href="/">
        <span aria-hidden="true">←&nbsp;</span>Back to start
      </TextLink>
    </chakra.p>
  );
}

/** "No data" for a whole drill-down: grey, the reason, and who was asked when. */
export function NoDataBlock({ reason, stamp }: { reason: string; stamp: ProvenanceStamp }) {
  return (
    <chakra.div
      mt="6"
      p="5"
      bg="tile.noData"
      backgroundImage="repeating-linear-gradient(135deg, transparent 0 12px, {colors.tile.noDataStripe} 12px 24px)"
      data-state="no-data"
    >
      <chakra.p m="0" fontSize="2xl">
        No data
      </chakra.p>
      <chakra.p m="0" mt="1" textStyle="metro.body">
        {reason}
      </chakra.p>
      <chakra.p m="0" mt="3" textStyle="metro.caption">
        <Provenance {...stamp} />
      </chakra.p>
    </chakra.div>
  );
}

/** Sources behind this view that failed or had no data when the snapshot was built. */
export function GapList({ gaps }: { gaps: SourceStatusRecord[] }) {
  if (gaps.length === 0) return null;
  return (
    <chakra.ul
      aria-label="Sources missing from this view"
      listStyle="none"
      m="0"
      mt="3"
      p="0"
      display="flex"
      flexDirection="column"
      gap="1"
    >
      {gaps.map((g) => (
        <chakra.li
          key={g.adapter}
          px="3"
          py="2"
          bg="bg.panel"
          borderInlineStartWidth="4px"
          borderInlineStartColor="tile.amber"
          textStyle="metro.body"
        >
          {g.status === 'failed'
            ? `Partial: ${g.adapter} failed`
            : `Missing: ${g.adapter} had no data`}
          {g.reason === undefined ? '' : ` — ${g.reason}`}
        </chakra.li>
      ))}
    </chakra.ul>
  );
}
