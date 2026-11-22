import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { TileBoard } from '@/components/dashboard/TileBoard';
import { homeTiles } from '@/components/dashboard/home-tiles';
import { getDashboardData } from '@/server/dashboard';

export const metadata: Metadata = {
  title: 'Watchman',
  description: 'What needs your yes, how work flows, what AI costs and how quality trends.',
};

/**
 * The home view: the four tiles, most valuable first, from the server-read snapshot. Every
 * relative figure is measured from the snapshot's own as-of time, so a ranking, a stale count
 * and a countdown agree with the figures beside them.
 */
export default async function Home() {
  const data = await getDashboardData();
  const now = new Date(data.snapshot.generated_at);
  const tiles = homeTiles(data.snapshot, now, {
    utcOffsetMinutes: data.snapshot.utc_offset_minutes,
  });
  return (
    <DashboardShell view="start" title="start" data={data}>
      <TileBoard tiles={tiles} />
    </DashboardShell>
  );
}
