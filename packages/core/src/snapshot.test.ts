import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotValidationError,
  assertSnapshot,
  hasValue,
  parseSnapshot,
} from './index';
import { AS_OF, candidate, emptySnapshot } from './test/builders';

const withAttention = (candidates: unknown[]) => ({
  ...emptySnapshot(),
  attention: { state: 'value', source: 'synthetic', as_of: AS_OF, candidates },
});

describe('parseSnapshot', () => {
  it('accepts a snapshot whose every section is explicitly missing', () => {
    const result = parseSnapshot(emptySnapshot());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
      expect(hasValue(result.snapshot.attention)).toBe(false);
    }
  });

  it('accepts a section with values and keeps every field', () => {
    const result = parseSnapshot(withAttention([candidate({ manual: true })]));
    expect(result.ok).toBe(true);
    if (result.ok && result.snapshot.attention.state === 'value') {
      expect(result.snapshot.attention.candidates[0]).toMatchObject({ manual: true, value: 3 });
    }
  });

  it.each([null, 'snapshot', 42, []])('refuses a non-object (%j) without throwing', (input) => {
    expect(parseSnapshot(input).ok).toBe(false);
  });

  it('refuses an unknown schema version by name', () => {
    const result = parseSnapshot({ ...emptySnapshot(), schema_version: 2 });
    expect(result).toEqual({
      ok: false,
      issues: [{ path: 'schema_version', message: expect.stringContaining('unsupported') }],
    });
  });

  it('refuses a missing section instead of inventing one', () => {
    const input: Record<string, unknown> = { ...emptySnapshot() };
    delete input.spend;
    const result = parseSnapshot(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.path)).toContain('spend');
  });

  it('refuses a no_data record that does not say why', () => {
    const result = parseSnapshot({
      ...emptySnapshot(),
      metrics: { state: 'no_data', reason: '  ', source: 'synthetic', as_of: AS_OF },
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a figure without provenance', () => {
    const bad = { ...candidate() } as Record<string, unknown>;
    delete bad.as_of;
    const result = parseSnapshot(withAttention([bad]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('attention.candidates[0].as_of');
  });

  it.each(['http://example.com/a', 'javascript:alert(1)', 'https://localhost/a', 'not a url'])(
    'refuses a deep link that is not https to a dotted host: %s',
    (url) => {
      expect(parseSnapshot(withAttention([candidate({ url })])).ok).toBe(false);
    },
  );

  it('refuses an as_of without a time zone', () => {
    expect(parseSnapshot(withAttention([candidate({ as_of: '2026-01-14T14:00:00' })])).ok).toBe(
      false,
    );
  });

  it('refuses unknown keys, so a typo cannot pass silently', () => {
    expect(parseSnapshot({ ...emptySnapshot(), atention: {} }).ok).toBe(false);
    expect(parseSnapshot(withAttention([{ ...candidate(), score: 99 }])).ok).toBe(false);
  });

  it('refuses a value outside 1..5', () => {
    expect(parseSnapshot(withAttention([candidate({ value: 6 })])).ok).toBe(false);
    expect(parseSnapshot(withAttention([candidate({ value: 2.5 })])).ok).toBe(false);
  });

  it('refuses an as_of later than generated_at, beyond the skew allowance', () => {
    const result = parseSnapshot(withAttention([candidate({ as_of: '2026-01-14T16:00:00Z' })]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('attention.candidates[0].as_of');
    expect(parseSnapshot(withAttention([candidate({ as_of: '2026-01-14T15:04:00Z' })])).ok).toBe(
      true,
    );
  });

  it('defaults a quota period to a week', () => {
    const result = parseSnapshot({
      ...emptySnapshot(),
      spend: {
        state: 'value',
        source: 'synthetic',
        as_of: AS_OF,
        providers: [
          {
            id: 'p',
            label: 'Sample Provider',
            quota: {
              state: 'value',
              used: 1,
              limit: 2,
              unit: 'percent',
              resets_at: '2026-01-19T00:00:00Z',
              source: 'synthetic',
              as_of: AS_OF,
            },
            monthly_cost: { state: 'no_data', reason: 'none', source: 'synthetic', as_of: AS_OF },
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.snapshot.spend.state === 'value') {
      const quota = result.snapshot.spend.providers[0]?.quota;
      expect(quota?.state === 'value' && quota.period_days).toBe(7);
    }
  });

  it('refuses a metric name outside the sixteen', () => {
    const result = parseSnapshot({
      ...emptySnapshot(),
      metrics: {
        state: 'value',
        source: 'synthetic',
        as_of: AS_OF,
        projects: [{ project: 'Project Alpha', metrics: { Vibes: { state: 'no_data' } } }],
      },
    });
    expect(result.ok).toBe(false);
  });
});

describe('assertSnapshot', () => {
  it('returns the parsed snapshot', () => {
    expect(assertSnapshot(emptySnapshot()).generated_at).toBe('2026-01-14T15:00:00.000Z');
  });

  it('throws a SnapshotValidationError naming the paths, capped at five', () => {
    const bad = withAttention(Array.from({ length: 7 }, () => ({})));
    try {
      assertSnapshot(bad, 'test input');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotValidationError);
      const e = error as SnapshotValidationError;
      expect(e.message).toMatch(/^invalid test input: attention\.candidates\[0\]/);
      expect(e.message).toMatch(/\(\+\d+ more\)$/);
      expect(e.issues.length).toBeGreaterThan(5);
    }
  });

  it('names the root when the input is not an object', () => {
    expect(() => assertSnapshot(null)).toThrow(/invalid snapshot: \(root\)/);
  });
});
