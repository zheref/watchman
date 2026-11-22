import 'server-only';

import { cacheLife } from 'next/cache';
import { readDashboardData, type DashboardData } from './snapshot';

/**
 * How often the dashboard re-reads its snapshot: at most an hour. After `revalidate` seconds the
 * next request is served the cached page while a fresh one is rendered in the background, and
 * the page's "refreshed" stamp moves with it; `expire` forces a fresh read after a quiet day.
 */
export const SNAPSHOT_CACHE = { stale: 300, revalidate: 3600, expire: 86_400 } as const;

/**
 * The snapshot every dashboard route reads, cached on the server (`use cache`) and shared by the
 * home view and the four drill-downs, so they always show the same figures.
 */
export async function getDashboardData(): Promise<DashboardData> {
  'use cache';
  cacheLife(SNAPSHOT_CACHE);
  return readDashboardData(process.env, new Date());
}
