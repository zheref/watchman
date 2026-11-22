import {
  ATTENTION_LIMIT,
  combineProvenance,
  formatAsOf,
  parseSnapshot,
  rankAttention,
  type AttentionKind,
  type Provenance,
  type Snapshot,
} from '@watchman/core';

/**
 * What the Attention tile shows, as plain data. Ranking, validation and provenance all come from
 * `@watchman/core` (`parseSnapshot`, `rankAttention`, `combineProvenance`); this file only turns
 * their output into the words and figures the screen prints, so the screen itself holds no logic.
 *
 * Pure: the same input gives the same view. `now` is the snapshot's own `generated_at` (as the
 * web dashboard does), so a fixture ranks the same on every day it is opened.
 */

/** Plain words for why an item waits on the owner (the web dashboard uses the same words). */
export const KIND_LABEL: Record<AttentionKind, string> = {
  owner_decision: 'Needs your decision',
  blocked_card: 'Blocked',
  waiting_pr: 'Review waiting over 2 days',
};

/** `30h` under two days, `3d` from there. */
export function waitedLabel(hours: number): string {
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/**
 * The host a deep link opens, for its visible text. Parsed by hand: React Native's `URL` has
 * historically lacked `hostname`, and core has already restricted every link to `https` and a
 * dotted host name.
 */
export function linkHost(url: string): string {
  return /^https:\/\/([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
}

export interface StampView {
  source: string;
  /** ISO 8601, for machines. */
  asOf: string;
  /** `2026-01-14 14:30 UTC`, for people. */
  asOfLabel: string;
  manual: boolean;
}

const stampOf = (p: Provenance): StampView => ({
  source: p.source,
  asOf: p.as_of,
  asOfLabel: formatAsOf(p.as_of),
  manual: p.manual === true,
});

export interface AttentionItemView {
  id: string;
  /** 1-based position in the ranking. */
  rank: number;
  title: string;
  project: string;
  kindLabel: string;
  /** `3d`, `30h`. */
  waited: string;
  /** The deep link, opened with `Linking.openURL`. */
  url: string;
  host: string;
  stamp: StampView;
  /** One sentence a screen reader says for the whole row. */
  accessibilityLabel: string;
}

export type AttentionTileView =
  | {
      state: 'no_data';
      reason: string;
      /** Empty when the snapshot could not be read at all, so there is no source to name. */
      stamp: StampView | null;
      synthetic: boolean;
    }
  | {
      state: 'value';
      /** Every item that needs a yes, shown or not. */
      waiting: number;
      items: AttentionItemView[];
      /** One short line under the headline figure. */
      caption: string;
      /** Every source behind the shown items, the oldest as-of, manual if any part is. */
      stamp: StampView;
      synthetic: boolean;
    };

/** The screen reader's name for the whole tile. */
export function tileLabel(view: AttentionTileView): string {
  const synthetic = view.synthetic ? ' Synthetic data.' : '';
  if (view.state === 'no_data') return `Attention. No data: ${view.reason}.${synthetic}`;
  return `Attention. ${view.caption}.${synthetic}`;
}

function captionFor(waiting: number, shown: number): string {
  if (waiting === 0) return 'nothing needs your yes';
  const head = `${waiting === 1 ? 'item needs' : 'items need'} your yes`;
  return waiting > shown ? `${head} · the ${shown} most urgent below` : head;
}

/** Builds the tile from a validated snapshot. */
export function attentionTile(
  snapshot: Snapshot,
  now: Date = new Date(snapshot.generated_at),
): AttentionTileView {
  const synthetic = snapshot.synthetic === true;
  const section = snapshot.attention;
  if (section.state === 'no_data') {
    return {
      state: 'no_data',
      reason: section.reason,
      stamp: stampOf(section),
      synthetic,
    };
  }
  // Ranked once, in full: the headline counts everyone waiting, the list is the first few.
  const eligible = rankAttention(section.candidates, now, { limit: section.candidates.length });
  const ranked = eligible.slice(0, ATTENTION_LIMIT);
  const items = ranked.map((item, index): AttentionItemView => {
    const waited = waitedLabel(item.waited_hours);
    const kindLabel = KIND_LABEL[item.kind];
    const stamp = stampOf(item);
    return {
      id: item.id,
      rank: index + 1,
      title: item.title,
      project: item.project,
      kindLabel,
      waited,
      url: item.url,
      host: linkHost(item.url),
      stamp,
      accessibilityLabel:
        `Number ${index + 1}: ${item.title}. ${kindLabel}, ${item.project}, waiting ${waited}. ` +
        `Source ${stamp.source}, as of ${stamp.asOfLabel}${stamp.manual ? ', entered by hand' : ''}.`,
    };
  });
  return {
    state: 'value',
    waiting: eligible.length,
    items,
    caption: captionFor(eligible.length, items.length),
    stamp: stampOf(combineProvenance([section, ...ranked])),
    synthetic,
  };
}

/**
 * Builds the tile from a decoded JSON value, validating it with core first. A snapshot that fails
 * validation is "no data" with a fixed reason: never invented items, and never the validator's
 * messages (which can quote the input).
 */
export function attentionTileFromJson(input: unknown): AttentionTileView {
  const parsed = parseSnapshot(input);
  if (!parsed.ok) {
    return {
      state: 'no_data',
      reason: 'the snapshot could not be read',
      stamp: null,
      synthetic: false,
    };
  }
  return attentionTile(parsed.snapshot);
}
