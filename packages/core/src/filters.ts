import { DAY_MS, HOUR_MS, toMillis } from './time';

/**
 * Filters a reader applies to the snapshot's views: one project, and a lower time bound given as
 * an ISO 8601 `since`, a relative `window` such as `7d`, or both. Pure, like the rest of core: the
 * caller passes `now`, and nothing here reads the clock.
 */

/** A relative window: a whole number of hours, days or weeks, e.g. `48h`, `7d`, `2w`. */
export const WINDOW_PATTERN = /^([1-9]\d{0,3})([hdw])$/;

/** The longest window accepted, so a typo cannot ask for decades. */
export const MAX_WINDOW_DAYS = 366;

const UNIT_MS = { h: HOUR_MS, d: DAY_MS, w: 7 * DAY_MS } as const;

/**
 * A filter the caller gave cannot be used. Its message is written here and names only the value
 * the caller sent, so a server may hand it back to that caller; any other error may not be.
 */
export class FilterError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'FilterError';
  }
}

/** A window's length in milliseconds. Throws a {@link FilterError} on anything but `<n>h|d|w` in range. */
export function parseWindow(window: string): number {
  const match = WINDOW_PATTERN.exec(window);
  if (match === null) {
    throw new FilterError(`window must look like 48h, 7d or 2w, got ${JSON.stringify(window)}`);
  }
  const ms = Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
  if (ms > MAX_WINDOW_DAYS * DAY_MS) {
    throw new FilterError(`window must be at most ${MAX_WINDOW_DAYS}d, got ${window}`);
  }
  return ms;
}

export interface TimeFilterInput {
  /** An ISO 8601 date-time: keep what happened at or after it. */
  since?: string;
  /** A window back from `now`, e.g. `7d`. */
  window?: string;
}

/**
 * The effective lower bound, as an ISO 8601 UTC string, or `undefined` when neither is given.
 * With both, the later bound wins, so the result honours each of them. Throws a
 * {@link FilterError} on a bad `since` or `window`.
 */
export function resolveSince(input: TimeFilterInput, now: Date): string | undefined {
  const bounds: number[] = [];
  if (input.since !== undefined) {
    const since = Date.parse(input.since);
    if (Number.isNaN(since)) {
      throw new FilterError(
        `since must be an ISO 8601 date-time, got ${JSON.stringify(input.since)}`,
      );
    }
    bounds.push(since);
  }
  if (input.window !== undefined) bounds.push(now.getTime() - parseWindow(input.window));
  if (bounds.length === 0) return undefined;
  return new Date(Math.max(...bounds)).toISOString();
}

/** True when `iso` is at or after `since`; always true without a bound. */
export function isAtOrAfter(iso: string, since: string | undefined): boolean {
  return since === undefined || toMillis(iso) >= toMillis(since);
}

/** Project names compare trimmed and case-insensitively, so `project alpha` finds `Project Alpha`. */
export function normalizeProject(name: string): string {
  return name.trim().toLowerCase();
}

/** True when `project` matches `filter`; always true without a filter. */
export function matchesProject(project: string, filter: string | undefined): boolean {
  return filter === undefined || normalizeProject(project) === normalizeProject(filter);
}
