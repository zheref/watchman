import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import full from '@watchman/core/fixtures/synthetic/full.json';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotFileAdapter } from './snapshot';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'watchman-snapshot-'));
  await writeFile(join(dir, 'snapshot.json'), JSON.stringify(full));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('snapshotFileAdapter', () => {
  it('is absent when WATCHMAN_SNAPSHOT_DIR is unset: no default directory', () => {
    expect(snapshotFileAdapter({})).toBeNull();
  });

  it('reads snapshot.json from WATCHMAN_SNAPSHOT_DIR', async () => {
    const adapter = snapshotFileAdapter({ WATCHMAN_SNAPSHOT_DIR: dir });
    const report = await adapter?.fetch({ now: new Date('2026-01-14T15:00:00Z') });
    expect(report).toMatchObject({ source: 'file:snapshot.json', synthetic: true });
    expect(JSON.stringify(report)).not.toContain(dir);
  });
});
