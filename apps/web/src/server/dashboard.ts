import 'server-only';

import { cacheLife } from 'next/cache';
import type { DashboardData } from '@/lib/dashboard-data';
import { SERVER_EXPIRE_SECONDS, SERVER_REVALIDATE_SECONDS } from '@/lib/refresh';
import { readDashboardData } from './snapshot';

/**
 * How the dashboard's snapshot read is cached. A request more than `revalidate` seconds after the
 * last read is served it while a fresh read renders in the background (stale-while-revalidate);
 * past `expire` the request waits for a fresh read, so nothing served is over an hour old. Open
 * pages reload themselves every 20 minutes (lib/refresh.ts), and the page's "refreshed" stamp
 * says when its read happened.
 */
export const SNAPSHOT_CACHE = {
  stale: 300,
  revalidate: SERVER_REVALIDATE_SECONDS,
  expire: SERVER_EXPIRE_SECONDS,
} as const;

/**
 * The snapshot every dashboard route reads, cached on the server (`use cache`) and shared by the
 * home view and the four drill-downs, so they always show the same figures.
 */
export async function getDashboardData(): Promise<DashboardData> {
  'use cache';
  cacheLife(SNAPSHOT_CACHE);
  return readDashboardData(process.env, new Date());
}
