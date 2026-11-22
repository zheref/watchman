import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The source half of the server/client boundary (the build half is scripts/check-client-bundle.mjs,
 * run after every `next build`): no client module imports the server loader or a Node built-in,
 * and only the server modules read WATCHMAN_SNAPSHOT_DIR, behind `server-only`.
 */

const src = fileURLToPath(new URL('..', import.meta.url));

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('server/client boundary', () => {
  it('keeps client modules free of the server loader and Node built-ins', async () => {
    const files = await sources(src);
    const client = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      if (!/^['"]use client['"];/m.test(text)) continue;
      client.push(file);
      expect(text, file).not.toMatch(/from ['"](@\/server\/|node:|server-only)/);
      expect(text, file).not.toContain('process.env');
    }
    expect(client.length).toBeGreaterThan(5);
  });

  it('reads the snapshot directory only in server-only modules', async () => {
    for (const file of await sources(src)) {
      const text = await readFile(file, 'utf8');
      if (!/process\.env|node:fs/.test(text)) continue;
      expect(file, 'reads the environment or the file system').toMatch(/\/src\/server\//);
      expect(text, file).toMatch(/^import 'server-only';/m);
    }
  });
});
