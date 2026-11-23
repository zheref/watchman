import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SnapshotDirReader } from '@watchman/core';
import full from '@watchman/core/fixtures/synthetic/full.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { FIXTURE_SOURCE, loadSnapshot } from './snapshot';

/**
 * The server's loader is core's `resolveSnapshotSource` (tested there in full) with the fixture
 * and Node's file system plugged in; these check the plugging.
 */

const NOW = new Date('2026-01-14T16:00:00Z');

const memory = (files: Record<string, string>): SnapshotDirReader => ({
  list: () => Promise.resolve(Object.keys(files)),
  readText: (path) => Promise.resolve(files[path.split('/').pop()!]!),
});

describe('loadSnapshot', () => {
  it('serves the committed synthetic fixture when WATCHMAN_SNAPSHOT_DIR is unset', async () => {
    const loaded = await loadSnapshot({}, NOW);
    expect(loaded).toMatchObject({ origin: 'synthetic-fixture', source: FIXTURE_SOURCE });
    expect(loaded.snapshot.synthetic).toBe(true);
    expect(loaded.snapshot.generated_at).toBe(full.generated_at);
  });

  it('reads the directory through the reader it is given', async () => {
    const loaded = await loadSnapshot(
      { WATCHMAN_SNAPSHOT_DIR: '/data/watchman' },
      NOW,
      memory({ 'snapshot-2026-01-14T14-00-00Z.json': JSON.stringify(full) }),
    );
    expect(loaded).toMatchObject({
      origin: 'file',
      source: 'file:snapshot-2026-01-14T14-00-00Z.json',
    });
  });

  it("reads a real directory with Node's file system by default, path-free on failure", async () => {
    const loaded = await loadSnapshot({ WATCHMAN_SNAPSHOT_DIR: '/nonexistent-watchman-dir' }, NOW);
    expect(loaded).toMatchObject({
      origin: 'unavailable',
      problem: expect.stringMatching(/ENOENT/),
    });
    expect(JSON.stringify(loaded)).not.toContain('/nonexistent-watchman-dir');
  });

  it("reads a real snapshot file with Node's file system", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'watchman-mcp-snapshot-'));
    try {
      await writeFile(join(dir, 'snapshot-2026-01-14T15-00-00Z.json'), JSON.stringify(full));
      const loaded = await loadSnapshot({ WATCHMAN_SNAPSHOT_DIR: dir }, NOW);
      expect(loaded).toMatchObject({
        origin: 'file',
        source: 'file:snapshot-2026-01-14T15-00-00Z.json',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
