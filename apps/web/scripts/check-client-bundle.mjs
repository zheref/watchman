// Build-output guard, run after `next build` (see package.json "build"). It proves that nothing
// the server uses to find its data reaches a browser:
//
// 1. Every file under .next/static (the client bundle, shipped to every visitor) is free of the
//    snapshot directory's variable name, Node file-system imports and the server-only loader.
// 2. When the build ran with WATCHMAN_SNAPSHOT_DIR set, its VALUE (the directory path) appears in
//    no client file and in no prerendered page or RSC payload under .next/server/app either.
//
// Exit 0 when clean, 1 when a forbidden string is found (each hit printed without its context),
// 2 when there is no build output to check.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const nextDir = join(appDir, '.next');

/** Strings no client file may contain. */
export const CLIENT_FORBIDDEN = [
  'WATCHMAN_SNAPSHOT_DIR',
  'node:fs',
  'readDashboardData',
  'getDashboardData',
  'snapshot directory could not be listed',
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Every [file, needle] pair where `needle` occurs in a text file under `dir`. */
export async function findHits(dir, needles, extensions) {
  const hits = [];
  for await (const file of walk(dir)) {
    if (!extensions.some((ext) => file.endsWith(ext))) continue;
    const text = await readFile(file, 'utf8');
    for (const needle of needles) if (text.includes(needle)) hits.push([file, needle]);
  }
  return hits;
}

async function main() {
  const staticDir = join(nextDir, 'static');
  const serverAppDir = join(nextDir, 'server', 'app');
  if (!(await exists(staticDir))) {
    console.error('check-client-bundle: no .next/static; run `next build` first');
    return 2;
  }
  const dirValue = process.env.WATCHMAN_SNAPSHOT_DIR?.trim();
  const hits = await findHits(
    staticDir,
    dirValue ? [...CLIENT_FORBIDDEN, dirValue] : CLIENT_FORBIDDEN,
    ['.js', '.css', '.json', '.html', '.txt'],
  );
  if (dirValue && (await exists(serverAppDir))) {
    hits.push(...(await findHits(serverAppDir, [dirValue], ['.html', '.rsc', '.meta', '.body'])));
  }
  for (const [file, needle] of hits) {
    const label = needle === dirValue ? 'the WATCHMAN_SNAPSHOT_DIR value' : JSON.stringify(needle);
    console.error(`check-client-bundle: ${label} found in ${relative(appDir, file)}`);
  }
  if (hits.length > 0) return 1;
  console.log(
    `check-client-bundle: client bundle clean (${CLIENT_FORBIDDEN.length} server-only markers` +
      `${dirValue ? ', and the snapshot directory in client files and prerendered pages' : ''})`,
  );
  return 0;
}

process.exitCode = await main();
