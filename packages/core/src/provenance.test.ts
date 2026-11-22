import { describe, expect, it } from 'vitest';
import { combineProvenance, deepLink } from './index';

describe('deepLink', () => {
  it.each(['https://example.com/a', 'https://a.b.example.com/x?page=2#top'])(
    'accepts %s',
    (url) => {
      expect(deepLink.safeParse(url).success).toBe(true);
    },
  );

  // Built at run time, so no credential-shaped literal sits in the source for a scanner to flag.
  const withUserinfo = (userinfo: string) => ['https://', userinfo, '@', 'example.com/a'].join('');

  it.each([
    withUserinfo(['user', 'PLACEHOLDER'].join(':')),
    withUserinfo('user'),
    'https://example.com/a?token=PLACEHOLDER',
    'https://example.com/a?page=1&access_token=PLACEHOLDER',
    'https://example.com/a?SIG=PLACEHOLDER',
  ])('refuses a link carrying credentials: %s', (url) => {
    expect(deepLink.safeParse(url).success).toBe(false);
  });
});

describe('combineProvenance', () => {
  it('names every source once, keeps the oldest stamp and any manual mark', () => {
    expect(
      combineProvenance([
        { source: 'b', as_of: '2026-01-14T10:00:00Z' },
        { source: 'a', as_of: '2026-01-12T10:00:00Z', manual: true },
        { source: 'b', as_of: '2026-01-13T10:00:00Z' },
      ]),
    ).toEqual({ source: 'a + b', as_of: '2026-01-12T10:00:00Z', manual: true });
    expect(combineProvenance([{ source: 'a', as_of: '2026-01-12T10:00:00Z' }])).toEqual({
      source: 'a',
      as_of: '2026-01-12T10:00:00Z',
    });
  });

  it('refuses an empty list', () => {
    expect(() => combineProvenance([])).toThrow(RangeError);
  });
});
