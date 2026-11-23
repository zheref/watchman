// Build-output tripwire, run after `next build` (see package.json "build"). It checks that nothing
// the server uses to find its data reached what a browser downloads:
//
// 1. No file under .next/static (the client bundle, shipped to every visitor) contains the snapshot
//    directory's variable name, Node's file-system module, or the loader's own error text.
// 2. When the build ran with WATCHMAN_SNAPSHOT_DIR set, none of the directory's spellings (as
//    given, without trailing separators, resolved through symlinks, JSON-escaped) appears in a
//    client file, or in a page or RSC payload prerendered under .next/server/app.
//
// It is a tripwire over the build's output, not a proof about every response: pages rendered at
// runtime are not scanned (src/server/boundary.test.ts and the server-only import guard the
// source side). Exit 0 clean, 1 on a hit (each printed without context), 2 with no build output.
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Strings no client file may contain. Literal text only: a minifier renames identifiers. */
export const CLIENT_FORBIDDEN = [
  'WATCHMAN_SNAPSHOT_DIR',
  'node:fs',
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

/** Every spelling of `dir` worth looking for: as given, trimmed of separators, real, escaped. */
export async function directorySpellings(dir) {
  const given = dir.trim();
  const bare = given.replace(/[\\/]+$/, '') || given;
  const forms = new Set([given, bare]);
  try {
    forms.add(await realpath(bare));
  } catch {
    // A directory that does not exist has no other real spelling.
  }
  for (const form of [...forms]) forms.add(JSON.stringify(form).slice(1, -1));
  return [...forms].filter((form) => form.length > 1);
}

/** Every [file, needle] pair where `needle` occurs in a file under `dir` with one of `extensions`. */
export async function findHits(dir, needles, extensions) {
  const hits = [];
  for await (const file of walk(dir)) {
    if (!extensions.some((ext) => file.endsWith(ext))) continue;
    const text = await readFile(file, 'utf8');
    for (const needle of needles) if (text.includes(needle)) hits.push([file, needle]);
  }
  return hits;
}

/** Runs the check over the build in `nextDir`; returns the exit code and the lines to print. */
export async function checkBuild(nextDir, dirValue) {
  const staticDir = join(nextDir, 'static');
  const serverAppDir = join(nextDir, 'server', 'app');
  if (!(await exists(staticDir))) {
    return { code: 2, lines: ['check-client-bundle: no .next/static; run `next build` first'] };
  }
  const spellings = dirValue?.trim() ? await directorySpellings(dirValue) : [];
  const hits = await findHits(
    staticDir,
    [...CLIENT_FORBIDDEN, ...spellings],
    ['.js', '.css', '.json', '.html', '.txt', '.map'],
  );
  if (spellings.length > 0 && (await exists(serverAppDir))) {
    hits.push(...(await findHits(serverAppDir, spellings, ['.html', '.rsc', '.meta', '.body'])));
  }
  if (hits.length > 0) {
    return {
      code: 1,
      lines: hits.map(([file, needle]) => {
        const label = spellings.includes(needle)
          ? 'the WATCHMAN_SNAPSHOT_DIR value'
          : JSON.stringify(needle);
        return `check-client-bundle: ${label} found in ${relative(join(nextDir, '..'), file)}`;
      }),
    };
  }
  return {
    code: 0,
    lines: [
      `check-client-bundle: client bundle clean (${CLIENT_FORBIDDEN.length} server-only markers` +
        `${spellings.length > 0 ? `, ${spellings.length} spellings of the snapshot directory in client files and prerendered pages` : ''})`,
    ],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const nextDir = join(fileURLToPath(new URL('..', import.meta.url)), '.next');
  const { code, lines } = await checkBuild(nextDir, process.env.WATCHMAN_SNAPSHOT_DIR);
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exitCode = code;
}
