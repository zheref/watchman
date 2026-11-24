import type { AttentionKind } from '@watchman/core';

/**
 * The words and small formatters both apps print. One implementation, imported by `apps/web` and
 * `apps/mobile`, so the phone and the browser say the same thing about the same item.
 *
 * Framework-blind and pure: no React, no Next, no Expo, no `URL` (React Native's has historically
 * lacked `hostname`), so every function gives the same answer on Node, in a browser and on Hermes.
 */

/** Plain words for why an item waits on the owner. */
export const KIND_LABEL: Record<AttentionKind, string> = {
  owner_decision: 'Needs your decision',
  blocked_card: 'Blocked',
  waiting_pr: 'Review waiting over 2 days',
};

/** `30h` under two days, `3d` from there. */
export function waitedLabel(hours: number): string {
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** `https://` in either case, spelled out so no engine's case tables are consulted. */
const SCHEME = /^[Hh][Tt][Tt][Pp][Ss]:\/\//;

/** Where the authority ends. A browser reads `\` as `/` in an https URL, so it ends there too. */
const AUTHORITY_END = /[/?#\\]/;

/**
 * The host-name rule `deepLink` in `@watchman/core` holds a link to: at most 253 characters,
 * dotted, labels of ASCII letters, digits and inner hyphens, an alphabetic top level. Both cases
 * are spelled out and it is tested BEFORE lower-casing, so a look-alike such as the Kelvin sign
 * (which lower-cases to `k`) is never taken for an ASCII letter.
 */
const HOST_NAME = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/**
 * The host a deep link opens, for the link's visible text: `github.com`.
 *
 * One behaviour for both apps. It answers only for a link spelled exactly
 * `https://` + an optional user part + an ASCII host name + an optional `:` and up to five digits,
 * at most 65535, followed by the end, `/`, `?`, `#` or `\`. For anything else it answers `''`:
 * - it never throws, whatever it is handed (a non-string included);
 * - it never shows a user part: for `https://user:secret@example.com/` the host is what follows
 *   the last `@`, as a browser reads it;
 * - the answer is lower-case, with no port.
 *
 * It declines rather than guesses. A browser would repair many spellings this function refuses
 * (a leading or trailing space, a tab or line break anywhere, a missing or extra slash, a percent
 * escape or a non-ASCII letter in the host, a zero-padded port, an IP address), and `deepLink` in
 * core judges a link after that repair, so a validated snapshot can still carry one. Print
 * `linkDestination`, which never leaves a screen with an empty host.
 *
 * For every link `deepLink` accepts, a non-empty answer is exactly `new URL(url).hostname`: the
 * host named is the host the link opens. (Outside those links one difference is known: a label
 * that only looks like punycode, `xn--a.com`, is answered here and refused by a browser.)
 */
export function linkHost(url: string): string {
  if (typeof url !== 'string' || !SCHEME.test(url)) return '';
  const rest = url.slice('https://'.length);
  const end = rest.search(AUTHORITY_END);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  const colon = hostAndPort.indexOf(':');
  const host = colon === -1 ? hostAndPort : hostAndPort.slice(0, colon);
  const port = colon === -1 ? '' : hostAndPort.slice(colon + 1);
  if (!/^\d{0,5}$/.test(port) || Number(port) > 65535) return '';
  if (host.length > 253 || !HOST_NAME.test(host)) return '';
  return host.toLowerCase();
}

/**
 * The words that follow "opens" for a deep link: its host, or `another site` when the host cannot
 * be read. What the apps print, so a link never reads "opens " with nothing after it.
 */
export function linkDestination(url: string): string {
  return linkHost(url) || 'another site';
}
