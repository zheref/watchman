import { describe, expect, it } from 'vitest';
import { countdown, describeAge, formatAsOf, hoursSince, toMillis } from './index';

const now = new Date('2026-01-14T15:00:00Z');

describe('time helpers', () => {
  it('formats as-of stamps in UTC whatever the offset', () => {
    expect(formatAsOf('2026-01-12T09:05:00Z')).toBe('2026-01-12 09:05 UTC');
    expect(formatAsOf('2026-01-12T04:05:00-05:00')).toBe('2026-01-12 09:05 UTC');
  });

  it('refuses an unreadable timestamp', () => {
    expect(() => toMillis('yesterday')).toThrow(RangeError);
  });

  it.each([
    ['2026-01-14T14:59:30Z', 'just now'],
    ['2026-01-14T14:55:00Z', '5m ago'],
    ['2026-01-14T12:00:00Z', '3h ago'],
    ['2026-01-12T15:00:00Z', '2d ago'],
  ])('describes %s as %s', (iso, label) => {
    expect(describeAge(iso, now)).toBe(label);
  });

  it('never reports a negative wait', () => {
    expect(hoursSince('2026-01-15T00:00:00Z', now)).toBe(0);
    expect(hoursSince('2026-01-14T12:00:00Z', now)).toBe(3);
  });

  it.each([
    ['2026-01-16T19:30:00Z', '2d 4h'],
    ['2026-01-14T18:20:00Z', '3h 20m'],
    ['2026-01-14T15:45:00Z', '45m'],
    ['2026-01-14T15:00:30Z', '<1m'],
    ['2026-01-14T15:00:00Z', 'now'],
    ['2026-01-13T15:00:00Z', 'now'],
  ])('counts down to %s as %s', (iso, label) => {
    expect(countdown(iso, now).label).toBe(label);
  });

  it('breaks a countdown into parts', () => {
    expect(countdown('2026-01-16T19:30:00Z', now)).toMatchObject({
      days: 2,
      hours: 4,
      minutes: 30,
    });
  });
});
