import type { AttentionCandidate, AttentionKind } from './snapshot';
import { compareText } from './rank';
import { DAY_MS, HOUR_MS, hoursSince, toMillis } from './time';

/**
 * Attention: the few items that need the owner's yes, ranked so the most valuable and most
 * urgent come first (Pareto: the item that unblocks the most, soonest, is item one).
 *
 * Pure and deterministic: the same candidates and the same `now` always give the same list.
 */

/** How many items the Attention tile shows. */
export const ATTENTION_LIMIT = 5;

/** A pull request only needs the owner once it has waited longer than this. */
export const PR_WAIT_THRESHOLD_HOURS = 48;

/** Tie-break order between kinds: a decision the owner owes beats a blocked card beats a PR. */
const KIND_ORDER: Record<AttentionKind, number> = {
  owner_decision: 0,
  blocked_card: 1,
  waiting_pr: 2,
};

export interface RankedAttentionItem extends AttentionCandidate {
  /** `value × urgency`, 1 to 25. */
  score: number;
  /** 1 (can wait) to 5 (now). */
  urgency: number;
  /** Hours the item has been waiting, at `now`. */
  waited_hours: number;
}

/** Urgency from how long the item has waited (1 under a day, up to 5 at a week or more). */
function urgencyFromWait(hours: number): number {
  if (hours < 24) return 1;
  if (hours < 48) return 2;
  if (hours < 72) return 3;
  if (hours < 168) return 4;
  return 5;
}

/**
 * Urgency of one candidate at `now`: the longer of its wait and its deadline pressure. A deadline
 * already passed, or under a day away, is 5; under three days away is at least 4.
 */
export function urgencyOf(candidate: AttentionCandidate, now: Date): number {
  let urgency = urgencyFromWait(hoursSince(candidate.waiting_since, now));
  if (candidate.due_at !== undefined) {
    const left = toMillis(candidate.due_at) - now.getTime();
    if (left < DAY_MS) urgency = 5;
    else if (left < 3 * DAY_MS) urgency = Math.max(urgency, 4);
  }
  return urgency;
}

/** Whether a candidate belongs on the tile at all at `now`. */
export function isEligible(candidate: AttentionCandidate, now: Date): boolean {
  if (candidate.kind !== 'waiting_pr') return true;
  return now.getTime() - toMillis(candidate.waiting_since) > PR_WAIT_THRESHOLD_HOURS * HOUR_MS;
}

/**
 * How many distinct candidates (first report of an id wins, as in {@link rankAttention}) are not
 * yet eligible at `now`: pull requests that have not waited {@link PR_WAIT_THRESHOLD_HOURS} yet.
 */
export function countNotYetEligible(candidates: readonly AttentionCandidate[], now: Date): number {
  const seen = new Set<string>();
  let count = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (!isEligible(candidate, now)) count += 1;
  }
  return count;
}

export interface RankOptions {
  /** How many to keep; {@link ATTENTION_LIMIT} by default. */
  limit?: number;
}

/**
 * Ranks attention candidates at `now` and keeps the top `limit`.
 *
 * - Drops ineligible items (PRs that have not yet waited more than 48h) and duplicate ids (the
 *   first one reported wins).
 * - Orders by score (`value × urgency`), then higher value, then longer wait, then kind
 *   (decision, blocked card, PR), then id, so the order is total and reproducible.
 */
export function rankAttention(
  candidates: readonly AttentionCandidate[],
  now: Date,
  options: RankOptions = {},
): RankedAttentionItem[] {
  const limit = options.limit ?? ATTENTION_LIMIT;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${String(limit)}`);
  }
  const seen = new Set<string>();
  const ranked: RankedAttentionItem[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (!isEligible(candidate, now)) continue;
    const urgency = urgencyOf(candidate, now);
    ranked.push({
      ...candidate,
      urgency,
      score: candidate.value * urgency,
      waited_hours: Math.floor(hoursSince(candidate.waiting_since, now)),
    });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.value - a.value ||
      toMillis(a.waiting_since) - toMillis(b.waiting_since) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      compareText(a.id, b.id),
  );
  return ranked.slice(0, limit);
}
