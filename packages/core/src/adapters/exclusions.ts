import type { Snapshot } from '../snapshot';

/**
 * Which material a snapshot may hold. Two layers:
 *
 * 1. **Always excluded** ({@link ALWAYS_EXCLUDED}): anything that mentions an employer or client
 *    whose material is under a non-disclosure agreement. The list is built in and cannot be
 *    switched off by configuration. The GitHub adapter applies it to repositories (and a fork's
 *    parent) before anything else about them is read, and {@link dropExcluded} applies it to every
 *    record of the merged snapshot, whatever source it came from, before the file is written.
 *    Matching is on a normalised form (NFKC, lower case, letters and digits only), so spacing,
 *    punctuation, case and zero-width characters do not get round it.
 * 2. **Owner-configured** exclusions for GitHub from the snapshot directory's config file: exact
 *    names (`name` or `owner/name`) and glob patterns (`*` any run of characters, `?` one
 *    character), all case-insensitive.
 */

/** Built-in, non-configurable exclusions, as normalised tokens. */
export const ALWAYS_EXCLUDED: readonly string[] = ['globallogic', 'insulet'];

export interface RepoRef {
  owner: string;
  name: string;
}

/** NFKC, lower case, letters and digits only: `Global-Logic`, `global logic` → `globallogic`. */
export function normalizeForExclusion(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** True when `text` mentions anything in {@link ALWAYS_EXCLUDED}. */
export function isAlwaysExcluded(text: string): boolean {
  const normal = normalizeForExclusion(text);
  return ALWAYS_EXCLUDED.some((token) => normal.includes(token));
}

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('')
    .map((ch) => {
      if (ch === '*') return '.*';
      if (ch === '?') return '.';
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`, 'i');
}

/**
 * Builds the exclusion test for a list of configured entries. An entry with a `/` is matched
 * against `owner/name`, any other against the name alone.
 */
export function compileExclusions(entries: readonly string[]): (repo: RepoRef) => boolean {
  const rules = entries
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => ({ full: entry.includes('/'), pattern: globToRegExp(entry) }));
  return (repo) => {
    if (isAlwaysExcluded(repo.owner) || isAlwaysExcluded(repo.name)) return true;
    const full = `${repo.owner}/${repo.name}`;
    return rules.some((rule) => rule.pattern.test(rule.full ? full : repo.name));
  };
}

function mentions(node: unknown): boolean {
  if (typeof node === 'string') return isAlwaysExcluded(node);
  if (Array.isArray(node)) return node.some(mentions);
  if (node !== null && typeof node === 'object') return Object.values(node).some(mentions);
  return false;
}

/**
 * The snapshot with every record that mentions excluded material removed: Attention candidates,
 * Flow projects, work items and board columns, Spend providers and Metrics projects. A section
 * label or reason that mentions it is replaced, never kept. Returns how many records it dropped.
 */
export function dropExcluded(snapshot: Snapshot): { snapshot: Snapshot; dropped: number } {
  let dropped = 0;
  const keep = <T>(items: readonly T[]): T[] =>
    items.filter((item) => {
      const hit = mentions(item);
      if (hit) dropped += 1;
      return !hit;
    });
  const clean = <T extends { state: string; source: string } & Record<string, unknown>>(
    s: T,
  ): T => {
    if (s.state === 'no_data' && mentions(s)) {
      dropped += 1;
      return { ...s, reason: 'withheld: it mentions excluded material', source: 'watchman' };
    }
    if (mentions(s.source)) return { ...s, source: 'watchman' };
    return s;
  };
  const a = snapshot.attention;
  const f = snapshot.flow;
  const s = snapshot.spend;
  const m = snapshot.metrics;
  const next: Snapshot = {
    ...snapshot,
    attention: clean(a.state === 'value' ? { ...a, candidates: keep(a.candidates) } : a),
    flow: clean(
      f.state === 'value'
        ? {
            ...f,
            projects: keep(f.projects),
            work_items: keep(f.work_items),
            board: clean(
              f.board.state === 'value' ? { ...f.board, columns: keep(f.board.columns) } : f.board,
            ),
          }
        : f,
    ),
    spend: clean(s.state === 'value' ? { ...s, providers: keep(s.providers) } : s),
    metrics: clean(m.state === 'value' ? { ...m, projects: keep(m.projects) } : m),
  };
  return { snapshot: next, dropped };
}
