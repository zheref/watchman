import { describe, expect, it } from 'vitest';
import fullFixture from '../fixtures/synthetic/full.json';
import {
  ATTENTION_LIMIT,
  assertSnapshot,
  isEligible,
  rankAttention,
  urgencyOf,
  type AttentionCandidate,
} from './index';
import { NOW, candidate } from './test/builders';

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('isEligible', () => {
  it('admits a PR only after it has waited more than 48h', () => {
    expect(isEligible(candidate({ kind: 'waiting_pr', waiting_since: hoursAgo(47) }), NOW)).toBe(
      false,
    );
    expect(isEligible(candidate({ kind: 'waiting_pr', waiting_since: hoursAgo(48) }), NOW)).toBe(
      false,
    );
    expect(isEligible(candidate({ kind: 'waiting_pr', waiting_since: hoursAgo(49) }), NOW)).toBe(
      true,
    );
  });

  it('always admits decisions and blocked cards', () => {
    expect(isEligible(candidate({ kind: 'owner_decision', waiting_since: hoursAgo(1) }), NOW)).toBe(
      true,
    );
    expect(isEligible(candidate({ kind: 'blocked_card', waiting_since: hoursAgo(1) }), NOW)).toBe(
      true,
    );
  });
});

describe('urgencyOf', () => {
  it.each([
    [1, 1],
    [30, 2],
    [50, 3],
    [100, 4],
    [200, 5],
  ])('rates a %ih wait as %i', (hours, urgency) => {
    expect(urgencyOf(candidate({ waiting_since: hoursAgo(hours) }), NOW)).toBe(urgency);
  });

  it('treats a deadline under a day away, or passed, as 5', () => {
    expect(urgencyOf(candidate({ waiting_since: hoursAgo(1), due_at: hoursAhead(5) }), NOW)).toBe(
      5,
    );
    expect(urgencyOf(candidate({ waiting_since: hoursAgo(1), due_at: hoursAgo(5) }), NOW)).toBe(5);
  });

  it('lifts a deadline under three days away to at least 4', () => {
    expect(urgencyOf(candidate({ waiting_since: hoursAgo(1), due_at: hoursAhead(48) }), NOW)).toBe(
      4,
    );
    expect(
      urgencyOf(candidate({ waiting_since: hoursAgo(200), due_at: hoursAhead(48) }), NOW),
    ).toBe(5);
    expect(urgencyOf(candidate({ waiting_since: hoursAgo(1), due_at: hoursAhead(96) }), NOW)).toBe(
      1,
    );
  });
});

describe('rankAttention', () => {
  it('ranks the synthetic fixture into the expected top five', () => {
    const snapshot = assertSnapshot(fullFixture);
    if (snapshot.attention.state !== 'value') throw new Error('fixture attention missing');
    const ranked = rankAttention(snapshot.attention.candidates, new Date(snapshot.generated_at));
    expect(ranked).toHaveLength(ATTENTION_LIMIT);
    expect(ranked.map((r) => [r.id, r.score])).toEqual([
      ['orchard-card-7', 16],
      ['alpha-decision-1', 15],
      ['alpha-pr-12', 12],
      ['lighthouse-decision-2', 10],
      ['alpha-decision-4', 6],
    ]);
    expect(ranked.every((r) => r.url.startsWith('https://'))).toBe(true);
  });

  it('orders by value × urgency', () => {
    const ranked = rankAttention(
      [
        candidate({ id: 'low', value: 1, waiting_since: hoursAgo(200) }), // 1 × 5
        candidate({ id: 'high', value: 4, waiting_since: hoursAgo(50) }), // 4 × 3
      ],
      NOW,
    );
    expect(ranked.map((r) => r.id)).toEqual(['high', 'low']);
    expect(ranked[0]).toMatchObject({ score: 12, urgency: 3, waited_hours: 50 });
  });

  it('breaks ties by value, then wait, then kind, then id', () => {
    const items: AttentionCandidate[] = [
      candidate({ id: 'd', kind: 'waiting_pr', value: 2, waiting_since: hoursAgo(100) }), // 8
      candidate({ id: 'c', kind: 'owner_decision', value: 2, waiting_since: hoursAgo(100) }), // 8
      candidate({ id: 'b', value: 2, waiting_since: hoursAgo(150) }), // 8, waited longer
      candidate({ id: 'a', value: 4, waiting_since: hoursAgo(30) }), // 8, higher value
      candidate({ id: 'e', kind: 'owner_decision', value: 2, waiting_since: hoursAgo(100) }), // 8
    ];
    expect(rankAttention(items, NOW).map((r) => r.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('is deterministic whatever the input order', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      candidate({ id: `i${n}`, value: (n % 5) + 1, waiting_since: hoursAgo(n * 20) }),
    );
    const forward = rankAttention(items, NOW).map((r) => r.id);
    const backward = rankAttention([...items].reverse(), NOW).map((r) => r.id);
    expect(backward).toEqual(forward);
  });

  it('keeps only the first of a duplicated id', () => {
    const ranked = rankAttention(
      [candidate({ id: 'x', value: 1 }), candidate({ id: 'x', value: 5 })],
      NOW,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.value).toBe(1);
  });

  it('honours the limit and refuses a bad one', () => {
    const items = [1, 2, 3].map((n) => candidate({ id: `i${n}` }));
    expect(rankAttention(items, NOW, { limit: 2 })).toHaveLength(2);
    expect(rankAttention(items, NOW, { limit: 0 })).toEqual([]);
    expect(() => rankAttention(items, NOW, { limit: -1 })).toThrow(RangeError);
  });

  it('returns nothing for nothing', () => {
    expect(rankAttention([], NOW)).toEqual([]);
  });
});
