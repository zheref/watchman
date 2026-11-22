import { describe, expect, it } from 'vitest';
import empty from '../fixtures/synthetic/empty.json';
import full from '../fixtures/synthetic/full.json';
import { assertSnapshot, sourceGaps, type SourceStatusRecord } from './index';

const withSources = (fixture: unknown, sources: SourceStatusRecord[]) =>
  assertSnapshot({ ...(fixture as object), sources });

describe('sourceGaps', () => {
  it('is empty for a snapshot with no sources record', () => {
    expect(sourceGaps(assertSnapshot(full), 'flow')).toEqual([]);
  });

  it('lists failed and no-data sources that feed the section, and only those', () => {
    const snapshot = withSources(full, [
      { adapter: 'github', status: 'failed', feeds: ['attention', 'flow'], reason: 'gh exit 1' },
      { adapter: 'handoff-board', status: 'no_data', feeds: ['flow'], reason: 'no export' },
      { adapter: 'spend-sheet', status: 'failed', feeds: ['spend'] },
      { adapter: 'tracker', status: 'value', feeds: ['flow'] },
    ]);
    expect(sourceGaps(snapshot, 'flow').map((g) => g.adapter)).toEqual(['github', 'handoff-board']);
    expect(sourceGaps(snapshot, 'attention').map((g) => g.adapter)).toEqual(['github']);
    expect(sourceGaps(snapshot, 'metrics')).toEqual([]);
  });

  it('does not repeat a no-data section’s own reason as a gap', () => {
    const snapshot = assertSnapshot(empty);
    if (snapshot.metrics.state !== 'no_data') throw new Error('fixture metrics should be missing');
    const reason = snapshot.metrics.reason;
    const withGap = withSources(empty, [
      { adapter: 'scorecard', status: 'no_data', feeds: ['metrics'], reason },
      { adapter: 'other', status: 'failed', feeds: ['metrics'], reason: 'boom' },
    ]);
    expect(sourceGaps(withGap, 'metrics').map((g) => g.adapter)).toEqual(['other']);
  });
});
