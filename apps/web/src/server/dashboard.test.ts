import { describe, expect, it, vi } from 'vitest';

const cacheLife = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ cacheLife }));

const { SNAPSHOT_CACHE, getDashboardData } = await import('./dashboard');

describe('getDashboardData', () => {
  it('re-reads the snapshot at least hourly', () => {
    expect(SNAPSHOT_CACHE.revalidate).toBeLessThanOrEqual(3600);
    expect(SNAPSHOT_CACHE.expire).toBeGreaterThan(SNAPSHOT_CACHE.revalidate);
  });

  it('declares that lifetime and reads through the server-only loader', async () => {
    vi.stubEnv('WATCHMAN_SNAPSHOT_DIR', '');
    const data = await getDashboardData();
    expect(cacheLife).toHaveBeenCalledWith(SNAPSHOT_CACHE);
    expect(data.origin).toBe('synthetic-fixture');
    expect(Date.parse(data.read_at)).not.toBeNaN();
    vi.unstubAllEnvs();
  });
});
