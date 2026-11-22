/**
 * Generic ranking primitive. The Attention tile (and anything else that shows a short
 * "most important first" list) ranks items by a score and keeps the top few.
 *
 * Domain types and the real scoring model arrive in later phases; this is only the
 * deterministic ordering they will build on.
 */
export type Scorer<T> = (item: T) => number;

/**
 * Returns at most `limit` items, highest score first. Ties keep their input order so the
 * result is stable and reproducible. Items whose score is not a finite number are dropped,
 * because an unscorable item must never outrank a scored one by accident.
 */
export function topN<T>(items: readonly T[], limit: number, score: Scorer<T>): T[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${String(limit)}`);
  }
  return items
    .map((item, index) => ({ item, index, value: score(item) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
