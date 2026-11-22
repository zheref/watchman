/**
 * Small, deterministic time helpers shared by every surface. They never read the clock: the
 * caller passes `now`, so a render, a test and an MCP response agree on the same instant.
 */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Parses an ISO 8601 timestamp, refusing anything `Date` cannot read. */
export function toMillis(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`not an ISO 8601 date-time: ${iso}`);
  return ms;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-01-12T09:05:00Z` → `2026-01-12 09:05 UTC`. Always UTC, so server and client agree. */
export function formatAsOf(iso: string): string {
  const d = new Date(toMillis(iso));
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

/** How long ago `iso` was, relative to `now`: `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function describeAge(iso: string, now: Date): string {
  const age = now.getTime() - toMillis(iso);
  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m ago`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`;
  return `${Math.floor(age / DAY_MS)}d ago`;
}

/** Whole hours elapsed from `iso` to `now`, never negative. */
export function hoursSince(iso: string, now: Date): number {
  return Math.max(0, (now.getTime() - toMillis(iso)) / HOUR_MS);
}

export interface Countdown {
  /** Milliseconds left, never negative. */
  total_ms: number;
  days: number;
  hours: number;
  minutes: number;
  /** Compact label: `2d 4h`, `3h 20m`, `45m`, `<1m` or `now`. */
  label: string;
}

/** Time left from `now` until `targetIso`. */
export function countdown(targetIso: string, now: Date): Countdown {
  const total = Math.max(0, toMillis(targetIso) - now.getTime());
  const days = Math.floor(total / DAY_MS);
  const hours = Math.floor((total % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS);
  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${minutes}m`;
  else if (minutes > 0) label = `${minutes}m`;
  else if (total > 0) label = '<1m';
  else label = 'now';
  return { total_ms: total, days, hours, minutes, label };
}
