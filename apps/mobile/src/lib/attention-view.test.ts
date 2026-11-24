import {
  ATTENTION_LIMIT,
  assertSnapshot,
  rankAttention,
  type Snapshot,
  type SnapshotInput,
} from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import manualOnly from '@watchman/core/fixtures/synthetic/manual-only.json';
import overflow from '@watchman/core/fixtures/synthetic/overflow.json';
import { KIND_LABEL, linkDestination, linkHost, waitedLabel } from '@watchman/ui';
import { LINK_HOST_CASES } from '@watchman/ui/testing';
import { describe, expect, it } from 'vitest';
import {
  attentionTile,
  attentionTileFromJson,
  showManualBadge,
  stampText,
  tileLabel,
} from './attention-view';
import * as attentionView from './attention-view';
import { loadAttentionTile } from './load-attention';

const snapshotOf = (input: unknown): Snapshot => assertSnapshot(input);

describe('the screen view-model on the bundled synthetic fixture', () => {
  const view = loadAttentionTile();

  it('shows the fixture as synthetic, with a value', () => {
    expect(view.state).toBe('value');
    expect(view.synthetic).toBe(true);
  });

  it('renders the ids core ranks first, in core order', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    const snapshot = snapshotOf(full);
    if (snapshot.attention.state !== 'value') throw new Error('fixture has attention');
    const expected = rankAttention(snapshot.attention.candidates, new Date(snapshot.generated_at));
    expect(view.items.map((i) => i.id)).toEqual(
      expected.slice(0, ATTENTION_LIMIT).map((i) => i.id),
    );
    expect(view.items.map((i) => i.rank)).toEqual(view.items.map((_, i) => i + 1));
  });

  it('pins the ranked order, derived by hand as value × urgency at generated_at', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    // orchard-card-7 4×4=16, alpha-decision-1 5×3=15, alpha-pr-12 3×4=12,
    // lighthouse-decision-2 2×5=10 (due in 5h), alpha-decision-4 3×2=6; orchard-card-2 1×5=5
    // is sixth, and lighthouse-pr-3 has waited under 48h so it is not eligible at all.
    expect(view.items.map((i) => [i.id, i.kindLabel, i.waited])).toEqual([
      ['orchard-card-7', 'Blocked', '6d'],
      ['alpha-decision-1', 'Needs your decision', '2d'],
      ['alpha-pr-12', 'Review waiting over 2 days', '3d'],
      ['lighthouse-decision-2', 'Needs your decision', '6h'],
      ['alpha-decision-4', 'Needs your decision', '36h'],
    ]);
    expect(view.waiting).toBe(6);
    expect(view.caption).toBe('items need your yes · the 5 most urgent below');
  });

  it('gives every item its deep link, host, source and as-of', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    for (const item of view.items) {
      expect(item.url).toMatch(/^https:\/\/example\.com\//);
      expect(item.host).toBe('example.com');
      expect(item.stamp.source).not.toBe('');
      expect(item.stamp.asOfLabel).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
      expect(item.accessibilityLabel).toContain(item.title);
      expect(item.accessibilityLabel).toContain(item.stamp.source);
      expect(item.accessibilityLabel).toContain(item.stamp.asOfLabel);
    }
  });

  it('stamps the tile with every source behind it and the oldest as-of', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    expect(view.stamp.source).toBe('synthetic + synthetic-board + synthetic-forge');
    expect(view.stamp.asOf).toBe('2026-01-14T14:30:00Z');
    expect(view.stamp.manual).toBe(false);
  });

  it('counts everyone waiting, not just the shown few, and says so', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    expect(view.items.length).toBeLessThanOrEqual(ATTENTION_LIMIT);
    expect(view.waiting).toBeGreaterThanOrEqual(view.items.length);
    expect(view.caption).toContain('your yes');
  });
});

describe('overflow: more than five waiting', () => {
  const view = attentionTile(snapshotOf(overflow));

  it('keeps the top five and counts the rest in the headline', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    expect(view.items).toHaveLength(ATTENTION_LIMIT);
    expect(view.waiting).toBeGreaterThan(ATTENTION_LIMIT);
    expect(view.caption).toBe(`items need your yes · the ${ATTENTION_LIMIT} most urgent below`);
  });

  it('stamps the tile with every waiting item, not just the shown five', () => {
    if (view.state !== 'value') throw new Error('expected a value');
    const snapshot = snapshotOf(overflow);
    if (snapshot.attention.state !== 'value') throw new Error('fixture has attention');
    const all = rankAttention(snapshot.attention.candidates, new Date(snapshot.generated_at), {
      limit: snapshot.attention.candidates.length,
    });
    const sources = new Set(all.flatMap((i) => i.source.split(' + ')));
    for (const source of sources) expect(view.stamp.source).toContain(source);
    const oldest = all.map((i) => Date.parse(i.as_of)).reduce((a, b) => Math.min(a, b));
    expect(Date.parse(view.stamp.asOf)).toBeLessThanOrEqual(oldest);
  });
});

describe('labelled states', () => {
  it('the empty fixture is a labelled "no data" tile with its reason and stamp', () => {
    const view = attentionTile(snapshotOf(empty));
    expect(view.state).toBe('no_data');
    if (view.state !== 'no_data') throw new Error('expected no_data');
    expect(view.reason).not.toBe('');
    expect(view.stamp?.source).not.toBe('');
  });

  it('a value section with nobody waiting says so, with a zero that is a real count', () => {
    const input = {
      ...(full as SnapshotInput),
      attention: { ...(full.attention as object), candidates: [] },
    };
    const view = attentionTile(snapshotOf(input));
    if (view.state !== 'value') throw new Error('expected a value');
    expect(view.waiting).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.caption).toBe('nothing needs your yes');
    expect(view.stamp.source).toBe('synthetic');
  });

  it('builds a no-data view from a no_data section, never a zero', () => {
    const input = {
      ...(full as SnapshotInput),
      attention: {
        state: 'no_data',
        reason: 'board adapter not configured',
        source: 'synthetic',
        as_of: '2026-01-14T14:00:00Z',
      },
    };
    const view = attentionTile(snapshotOf(input));
    expect(view).toEqual({
      state: 'no_data',
      reason: 'board adapter not configured',
      stamp: {
        source: 'synthetic',
        asOf: '2026-01-14T14:00:00Z',
        asOfLabel: '2026-01-14 14:00 UTC',
        manual: false,
      },
      synthetic: true,
    });
    expect(tileLabel(view)).toBe(
      'Attention. No data: board adapter not configured. Synthetic data.',
    );
  });

  it('a snapshot that fails core validation is "no data" with a fixed reason', () => {
    const view = attentionTileFromJson({ schema_version: 99, secret: 'do-not-echo' });
    expect(view).toEqual({
      state: 'no_data',
      reason: 'the snapshot could not be read',
      stamp: null,
      synthetic: false,
    });
    expect(JSON.stringify(view)).not.toContain('do-not-echo');
  });

  it('marks hand-typed items as manual in the stamp and the row label', () => {
    const view = attentionTile(snapshotOf(manualOnly));
    if (view.state !== 'value') throw new Error('expected a value');
    expect(view.stamp.manual).toBe(true);
    expect(view.items.every((i) => i.stamp.manual)).toBe(true);
    expect(view.items[0]?.accessibilityLabel).toContain('entered by hand');
  });

  it('names the tile for a screen reader, with the synthetic marker', () => {
    const view = loadAttentionTile();
    expect(tileLabel(view)).toMatch(/^Attention\. .* your yes.*\. Synthetic data\.$/);
  });
});

describe('the shared presentation helpers, as the mobile app prints them', () => {
  it('labels every attention kind in the shared words', () => {
    expect(Object.keys(KIND_LABEL).sort()).toEqual([
      'blocked_card',
      'owner_decision',
      'waiting_pr',
    ]);
  });

  it('waitedLabel is hours under two days, days from there', () => {
    expect(waitedLabel(0)).toBe('0h');
    expect(waitedLabel(47)).toBe('47h');
    expect(waitedLabel(48)).toBe('2d');
    expect(waitedLabel(100)).toBe('4d');
  });

  it.each(LINK_HOST_CASES)('linkHost(%j) is %j, the one answer both apps give', (url, host) => {
    expect(linkHost(url)).toBe(host);
  });

  it('puts the shared words and host on every row of the tile', () => {
    const tile = attentionTile(assertSnapshot(full));
    if (tile.state !== 'value') throw new Error('expected a tile with items');
    expect(tile.items.length).toBeGreaterThan(0);
    for (const item of tile.items) {
      expect(item.host).toBe(linkHost(item.url));
      expect(item.host).toBe(linkDestination(item.url));
      expect(item.host).not.toBe('');
      expect(Object.values(KIND_LABEL)).toContain(item.kindLabel);
    }
  });

  it('prints plain words, never an empty host, for a link whose host cannot be read', () => {
    const input = structuredClone(full) as { attention: { candidates: { url: string }[] } };
    for (const candidate of input.attention.candidates) candidate.url = 'https://bücher.example/a';
    const tile = attentionTile(assertSnapshot(input));
    if (tile.state !== 'value') throw new Error('expected a tile with items');
    expect(tile.items.length).toBeGreaterThan(0);
    for (const item of tile.items) expect(item.host).toBe('another site');
  });

  it('exports none of the shared helpers itself (the lint rule refuses a copy anywhere in the app)', () => {
    for (const name of ['KIND_LABEL', 'waitedLabel', 'linkHost', 'linkDestination']) {
      expect(Object.keys(attentionView)).not.toContain(name);
    }
  });
});

describe('the pieces the tile component prints', () => {
  const stamp = { source: 'synthetic-board', asOf: 'x', asOfLabel: '2026-01-14 14:30 UTC' };

  it('stampText joins source and as-of, and marks a manual entry', () => {
    expect(stampText({ ...stamp, manual: false })).toBe(
      'synthetic-board · as of 2026-01-14 14:30 UTC',
    );
    expect(stampText({ ...stamp, manual: true })).toBe(
      'synthetic-board · as of 2026-01-14 14:30 UTC · manual entry',
    );
  });

  it('wears the manual badge only for a value whose figures were typed in', () => {
    expect(showManualBadge(attentionTile(snapshotOf(manualOnly)))).toBe(true);
    expect(showManualBadge(loadAttentionTile())).toBe(false);
    expect(showManualBadge(attentionTileFromJson({}))).toBe(false);
  });
});
