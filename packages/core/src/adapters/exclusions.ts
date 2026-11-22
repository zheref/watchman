/**
 * Which repositories a snapshot may read. Two layers:
 *
 * 1. **Always excluded** ({@link ALWAYS_EXCLUDED}): any repository whose owner or name mentions an
 *    employer or client whose material is under a non-disclosure agreement. The list is built in,
 *    cannot be switched off by configuration, and is applied before any per-repository call, so
 *    such a repository is never read into a snapshot.
 * 2. **Owner-configured** exclusions from the snapshot directory's config file: exact names
 *    (`name` or `owner/name`) and glob patterns (`*` any run of characters, `?` one character),
 *    all case-insensitive.
 */

/** Built-in, non-configurable exclusions (case-insensitive substrings). */
export const ALWAYS_EXCLUDED: readonly RegExp[] = [/globallogic/i, /insulet/i];

export interface RepoRef {
  owner: string;
  name: string;
}

/** True when `text` mentions anything in {@link ALWAYS_EXCLUDED}. */
export function isAlwaysExcluded(text: string): boolean {
  return ALWAYS_EXCLUDED.some((pattern) => pattern.test(text));
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
