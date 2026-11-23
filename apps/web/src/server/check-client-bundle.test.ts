import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkBuild, directorySpellings } from '../../scripts/check-client-bundle.mjs';

let root: string;
let next: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'watchman-bundle-'));
  next = join(root, '.next');
  await mkdir(join(next, 'static', 'chunks'), { recursive: true });
  await mkdir(join(next, 'server', 'app'), { recursive: true });
  await writeFile(join(next, 'static', 'chunks', 'a.js'), 'console.log("clean")');
  await writeFile(join(next, 'server', 'app', 'index.html'), '<p>file:snapshot.json</p>');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('check-client-bundle', () => {
  it('passes a clean build, and refuses to judge a missing one', async () => {
    expect(await checkBuild(next, undefined)).toMatchObject({ code: 0 });
    expect(await checkBuild(join(root, 'nope'), undefined)).toMatchObject({ code: 2 });
  });

  it('fails on a server-only marker in a client file', async () => {
    await writeFile(join(next, 'static', 'chunks', 'b.js'), 'process.env.WATCHMAN_SNAPSHOT_DIR');
    const result = await checkBuild(next, undefined);
    expect(result.code).toBe(1);
    expect(result.lines[0]).toContain('"WATCHMAN_SNAPSHOT_DIR" found in .next/static/chunks/b.js');
  });

  it('fails on any spelling of the directory, in client files or prerendered pages', async () => {
    const data = join(root, 'data');
    await mkdir(data);
    const link = join(root, 'link');
    await symlink(data, link);
    // The page holds the resolved path; the variable names it through a symlink.
    await writeFile(
      join(next, 'server', 'app', 'flow.rsc'),
      JSON.stringify({ at: await realpath(data) }),
    );
    const viaLink = await checkBuild(next, `${link}/`);
    expect(viaLink.code).toBe(1);
    expect(viaLink.lines.join('\n')).toContain('the WATCHMAN_SNAPSHOT_DIR value found in');
    expect(viaLink.lines.join('\n')).not.toContain(data);
  });

  it('spells a directory as given, bare, real and JSON-escaped', async () => {
    const spellings = await directorySpellings('C:\\data\\ ');
    expect(spellings).toEqual(expect.arrayContaining(['C:\\data\\', 'C:\\data', 'C:\\\\data']));
  });
});
