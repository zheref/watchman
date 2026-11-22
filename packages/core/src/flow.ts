import type { FlowProject, WorkItem } from './snapshot';
import { compareText } from './rank';
import { DAY_MS, MINUTE_MS, toMillis } from './time';

/** An open item untouched for longer than this many days is stale. */
export const STALE_AFTER_DAYS = 3;

export interface WeekBounds {
  /** Start of the current week (inclusive). */
  this_week_start: Date;
  /** Start of the previous week (inclusive); it ends where this week starts. */
  last_week_start: Date;
}

export interface WeekOptions {
  /** First day of the week, 0 = Sunday … 6 = Saturday. Monday (1) by default. */
  weekStartsOn?: number;
  /** The owner's offset from UTC in minutes (e.g. -300 for UTC-5). 0 by default. */
  utcOffsetMinutes?: number;
}

/** The current and previous week around `now`, in the owner's local calendar. */
export function weekBounds(now: Date, options: WeekOptions = {}): WeekBounds {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const offset = (options.utcOffsetMinutes ?? 0) * MINUTE_MS;
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError(`weekStartsOn must be 0..6, got ${String(weekStartsOn)}`);
  }
  // Shift into local wall-clock time, find local midnight of the week's first day, shift back.
  const local = new Date(now.getTime() + offset);
  const sinceStart = (local.getUTCDay() - weekStartsOn + 7) % 7;
  const localMidnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - sinceStart,
  );
  const thisWeek = localMidnight - offset;
  return {
    this_week_start: new Date(thisWeek),
    last_week_start: new Date(thisWeek - 7 * DAY_MS),
  };
}

export interface Throughput {
  this_week: number;
  last_week: number;
  /** `this_week - last_week`. */
  delta: number;
  trend: 'up' | 'down' | 'flat';
}

/** Items completed this week (up to `now`) against items completed last week. */
export function throughput(
  items: readonly WorkItem[],
  now: Date,
  options: WeekOptions = {},
): Throughput {
  const { this_week_start, last_week_start } = weekBounds(now, options);
  const thisStart = this_week_start.getTime();
  const lastStart = last_week_start.getTime();
  const end = now.getTime();
  let thisWeek = 0;
  let lastWeek = 0;
  for (const item of items) {
    if (item.completed_at === undefined) continue;
    const at = toMillis(item.completed_at);
    if (at >= thisStart && at <= end) thisWeek += 1;
    else if (at >= lastStart && at < thisStart) lastWeek += 1;
  }
  const delta = thisWeek - lastWeek;
  return {
    this_week: thisWeek,
    last_week: lastWeek,
    delta,
    trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

export interface StaleItem extends WorkItem {
  /** Whole days since the item was last updated. */
  idle_days: number;
}

/** Open items not updated for more than `days` days (3 by default), most idle first. */
export function staleItems(
  items: readonly WorkItem[],
  now: Date,
  days: number = STALE_AFTER_DAYS,
): StaleItem[] {
  if (!(days >= 0)) throw new RangeError(`days must be non-negative, got ${String(days)}`);
  const cutoff = days * DAY_MS;
  return items
    .filter((item) => item.completed_at === undefined)
    .map((item) => ({ item, idle: now.getTime() - toMillis(item.updated_at) }))
    .filter(({ idle }) => idle > cutoff)
    .sort((a, b) => b.idle - a.idle || compareText(a.item.id, b.item.id))
    .map(({ item, idle }) => ({ ...item, idle_days: Math.floor(idle / DAY_MS) }));
}

export interface FlowTotals {
  open_prs: number;
  open_issues: number;
  projects: number;
}

/** Open PRs and issues summed over every project. */
export function flowTotals(projects: readonly FlowProject[]): FlowTotals {
  return projects.reduce<FlowTotals>(
    (sum, p) => ({
      open_prs: sum.open_prs + p.open_prs,
      open_issues: sum.open_issues + p.open_issues,
      projects: sum.projects + 1,
    }),
    { open_prs: 0, open_issues: 0, projects: 0 },
  );
}
