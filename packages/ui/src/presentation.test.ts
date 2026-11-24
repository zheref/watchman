import { describe, expect, it } from 'vitest';
import { deepLink } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import manualOnly from '@watchman/core/fixtures/synthetic/manual-only.json';
import overflow from '@watchman/core/fixtures/synthetic/overflow.json';
import pastReset from '@watchman/core/fixtures/synthetic/past-reset.json';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json';
import { KIND_LABEL, linkDestination, linkHost, waitedLabel } from './index';
import { LINK_HOST_CASES } from './test/link-host-cases';

/** Every string stored under a `url` key, at any depth: the deep links a snapshot carries. */
function deepLinksIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepLinksIn);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === 'url' && typeof inner === 'string' ? [inner] : deepLinksIn(inner),
  );
}

/** Whether the platform's own parser takes the link at all. */
function canParse(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** The platform's own URL parser, declared here because this package compiles with no platform types. */
declare const URL: new (url: string) => { readonly hostname: string };

describe('KIND_LABEL', () => {
  it('has plain words for every kind an item can wait for', () => {
    expect(KIND_LABEL).toEqual({
      owner_decision: 'Needs your decision',
      blocked_card: 'Blocked',
      waiting_pr: 'Review waiting over 2 days',
    });
  });
});

describe('waitedLabel', () => {
  it('is hours under two days, whole days from there', () => {
    expect(waitedLabel(0)).toBe('0h');
    expect(waitedLabel(30)).toBe('30h');
    expect(waitedLabel(47)).toBe('47h');
    expect(waitedLabel(48)).toBe('2d');
    expect(waitedLabel(80)).toBe('3d');
    expect(waitedLabel(100)).toBe('4d');
  });
});

describe('linkHost', () => {
  it.each(LINK_HOST_CASES)('%j opens %j', (url, host) => {
    expect(linkHost(url)).toBe(host);
  });

  it('never throws, whatever it is handed', () => {
    for (const value of [undefined, null, 42, {}, [], Symbol('x'), () => 'https://example.com']) {
      expect(linkHost(value as unknown as string)).toBe('');
    }
  });

  it('never shows a user part, a port, a path, an upper-case or a non-ASCII letter', () => {
    for (const [url] of LINK_HOST_CASES) {
      expect(linkHost(url)).toMatch(/^[a-z0-9.-]*$/);
    }
  });

  it('reads every deep link in the synthetic fixtures as a browser does', () => {
    const urls = [empty, full, manualOnly, overflow, pastReset, sparse].flatMap(deepLinksIn);
    expect(urls.length).toBeGreaterThan(10);
    for (const url of urls) {
      expect(deepLink.safeParse(url).success).toBe(true);
      expect(linkHost(url)).not.toBe('');
      expect(linkHost(url)).toBe(new URL(url).hostname);
    }
  });

  it('for every link core accepts, names the host a browser opens, or declines', () => {
    const accepted = LINK_HOST_CASES.filter(([url]) => deepLink.safeParse(url).success);
    const answered = accepted.filter(([, host]) => host !== '');
    expect(answered.length).toBeGreaterThan(10);
    for (const [url, host] of answered) expect(new URL(url).hostname).toBe(host);
    // Core judges a link after a browser's repairs, so it accepts spellings this function declines.
    const declined = accepted.filter(([, host]) => host === '').map(([url]) => url);
    for (const url of [
      ' https://example.com/',
      'https:example.com',
      'https://exa\nmple.com/',
      'https://ex%61mple.com/',
      'https://bücher.example/',
      'https://example.com:000000080/',
      'https://\u212Aitten.com/',
    ]) {
      expect(declined).toContain(url);
    }
  });

  it('agrees with the platform on every link both answer; only a punycode look-alike may differ', () => {
    // URL parsers disagree on a label that only looks like punycode (`xn--a.com`): some refuse
    // the link, some accept it with this same host. So the row is allowed to be refused by the
    // platform, never required to be, and no other row may be.
    const refused = LINK_HOST_CASES.filter(([url, host]) => host !== '' && !canParse(url));
    for (const [url] of refused) expect(url).toBe('https://xn--a.com/');
    const answered = LINK_HOST_CASES.filter(([url, host]) => host !== '' && canParse(url));
    expect(answered.length).toBeGreaterThan(10);
    for (const [url, host] of answered) expect(new URL(url).hostname).toBe(host);
  });

  it('answers a very long hostile string at once', () => {
    const started = Date.now();
    expect(linkHost(`https://${'a'.repeat(1_000_000)}`)).toBe('');
    expect(linkHost(`https://${'a.'.repeat(500_000)}com`)).toBe('');
    expect(linkHost(`https://${'@'.repeat(1_000_000)}example.com`)).toBe('example.com');
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('linkDestination', () => {
  it('is the host when it can be read, and plain words when it cannot', () => {
    expect(linkDestination('https://github.com/zheref/x/pull/1')).toBe('github.com');
    expect(linkDestination('https://user:secret@Example.COM:8443/p')).toBe('example.com');
    expect(linkDestination('https://bücher.example/')).toBe('another site');
    expect(linkDestination('not a link')).toBe('another site');
  });

  it('never leaves a screen with nothing after "opens"', () => {
    for (const [url, host] of LINK_HOST_CASES) {
      expect(linkDestination(url)).toBe(host === '' ? 'another site' : host);
    }
  });
});
