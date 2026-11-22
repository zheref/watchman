import { describe, expect, it } from 'vitest';
import {
  MAX_WINDOW_DAYS,
  isAtOrAfter,
  matchesProject,
  normalizeProject,
  parseWindow,
  resolveSince,
} from './filters';
import { DAY_MS, HOUR_MS } from './time';

const NOW = new Date('2026-01-14T15:00:00Z');

describe('parseWindow', () => {
  it.each([
    ['48h', 48 * HOUR_MS],
    ['7d', 7 * DAY_MS],
    ['2w', 14 * DAY_MS],
    [`${MAX_WINDOW_DAYS}d`, MAX_WINDOW_DAYS * DAY_MS],
  ])('reads %s', (window, ms) => expect(parseWindow(window)).toBe(ms));

  it.each(['', '7', 'd', '0d', '07d', '1.5d', '7D', '-7d', '7 d', '3m', '10000d'])(
    'refuses %j',
    (window) => expect(() => parseWindow(window)).toThrow(RangeError),
  );

  it('refuses a window longer than the maximum', () => {
    expect(() => parseWindow(`${MAX_WINDOW_DAYS + 1}d`)).toThrow(/at most/);
    expect(() => parseWindow('53w')).toThrow(/at most/);
  });
});

describe('resolveSince', () => {
  it('is undefined without a bound', () => {
    expect(resolveSince({}, NOW)).toBeUndefined();
  });

  it('normalises since to UTC', () => {
    expect(resolveSince({ since: '2026-01-10T07:00:00-05:00' }, NOW)).toBe(
      '2026-01-10T12:00:00.000Z',
    );
  });

  it('counts a window back from now', () => {
    expect(resolveSince({ window: '7d' }, NOW)).toBe('2026-01-07T15:00:00.000Z');
  });

  it('takes the later bound when both are given', () => {
    expect(resolveSince({ since: '2026-01-01T00:00:00Z', window: '2d' }, NOW)).toBe(
      '2026-01-12T15:00:00.000Z',
    );
    expect(resolveSince({ since: '2026-01-13T00:00:00Z', window: '2w' }, NOW)).toBe(
      '2026-01-13T00:00:00.000Z',
    );
  });

  it('refuses a bad since or window', () => {
    expect(() => resolveSince({ since: 'yesterday' }, NOW)).toThrow(RangeError);
    expect(() => resolveSince({ window: 'a week' }, NOW)).toThrow(RangeError);
  });
});

describe('isAtOrAfter', () => {
  it('keeps everything without a bound', () => {
    expect(isAtOrAfter('2000-01-01T00:00:00Z', undefined)).toBe(true);
  });

  it('includes the bound itself', () => {
    const since = '2026-01-10T00:00:00.000Z';
    expect(isAtOrAfter('2026-01-10T00:00:00Z', since)).toBe(true);
    expect(isAtOrAfter('2026-01-09T23:59:59Z', since)).toBe(false);
  });
});

describe('project matching', () => {
  it('ignores case and surrounding space', () => {
    expect(normalizeProject('  Project Alpha ')).toBe('project alpha');
    expect(matchesProject('Project Alpha', 'project alpha')).toBe(true);
    expect(matchesProject('Project Alpha', 'Project')).toBe(false);
  });

  it('matches everything without a filter', () => {
    expect(matchesProject('Anything', undefined)).toBe(true);
  });
});
