import { describe, expect, it } from 'vitest';
import { topN } from './index';

describe('topN', () => {
  const items = [
    { id: 'a', score: 1 },
    { id: 'b', score: 5 },
    { id: 'c', score: 3 },
    { id: 'd', score: 5 },
    { id: 'e', score: Number.NaN },
  ];
  const byScore = (item: { score: number }) => item.score;

  it('keeps the highest scores first, stable on ties', () => {
    expect(topN(items, 3, byScore).map((item) => item.id)).toEqual(['b', 'd', 'c']);
  });

  it('drops items that cannot be scored', () => {
    expect(topN(items, 10, byScore).map((item) => item.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('returns an empty list for a zero limit and rejects a bad one', () => {
    expect(topN(items, 0, byScore)).toEqual([]);
    expect(() => topN(items, -1, byScore)).toThrow(RangeError);
    expect(() => topN(items, 1.5, byScore)).toThrow(RangeError);
  });

  it('does not mutate its input', () => {
    const snapshot = items.map((item) => item.id);
    topN(items, 2, byScore);
    expect(items.map((item) => item.id)).toEqual(snapshot);
  });
});
