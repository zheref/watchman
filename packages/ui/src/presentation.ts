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

const SCHEME = 'https://';

/** Where the authority ends. A browser reads `\` as `/` in an https URL, so it ends there too. */
const AUTHORITY_END = /[/?#\\]/;

/**
 * The host-name rule `deepLink` in `@watchman/core` holds a link to: at most 253 characters,
 * dotted, labels of ASCII letters, digits and inner hyphens, an alphabetic top level.
 */
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * The host a deep link opens, for the link's visible text: `github.com`.
 *
 * One behaviour for both apps:
 * - it never throws: anything that is not an `https` link to a host name core would accept gives
 *   `''` (a non-string, another scheme, an IP address, a non-ASCII or percent-encoded host, a
 *   port that is not a number up to 65535);
 * - it never shows a user part: for `https://user:secret@example.com/` the host is what follows
 *   the last `@`, as a browser reads it;
 * - the answer is lower-case, with no port.
 *
 * Whenever it answers, the answer is exactly `new URL(url).hostname`. `deepLink` in core judges a
 * link after URL parsing, so it lets a few odd spellings through whose host this function will not
 * read: a leading space, a line break or a percent escape inside the host, a non-ASCII host. For
 * those the answer is `''`, never a guess; print `linkDestination` so no screen shows an empty host.
 */
export function linkHost(url: string): string {
  if (typeof url !== 'string') return '';
  if (url.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return '';
  const rest = url.slice(SCHEME.length);
  const end = rest.search(AUTHORITY_END);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  const colon = hostAndPort.indexOf(':');
  const host = (colon === -1 ? hostAndPort : hostAndPort.slice(0, colon)).toLowerCase();
  const port = colon === -1 ? '' : hostAndPort.slice(colon + 1);
  if (!/^\d{0,5}$/.test(port) || Number(port) > 65535) return '';
  if (host.length > 253 || !HOST_NAME.test(host)) return '';
  return host;
}

/**
 * The words that follow "opens" for a deep link: its host, or `another site` when the host cannot
 * be read. What the apps print, so a link never reads "opens " with nothing after it.
 */
export function linkDestination(url: string): string {
  return linkHost(url) || 'another site';
}
