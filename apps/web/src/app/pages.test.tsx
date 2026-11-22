import { assertSnapshot, type Snapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import full from '@watchman/core/fixtures/synthetic/full.json';
import manualOnly from '@watchman/core/fixtures/synthetic/manual-only.json';
import pastReset from '@watchman/core/fixtures/synthetic/past-reset.json';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkup } from '@/test/render';
import type { DashboardData } from '@/server/snapshot';
import AttentionPage from './attention/page';
import FlowPage from './flow/page';
import MetricsPage from './metrics/page';
import Home from './page';
import SpendPage from './spend/page';
import ThemePreview from './theme/page';

const state = vi.hoisted(() => ({ data: null as DashboardData | null }));
vi.mock('@/server/dashboard', () => ({ getDashboardData: () => Promise.resolve(state.data) }));

const READ_AT = '2026-01-14T16:00:00Z';
const fileData = (snapshot: Snapshot, read_at = READ_AT): DashboardData => ({
  snapshot,
  origin: 'file',
  source: 'file:snapshot-2026-01-14T15-00-00Z.json',
  skipped: [],
  read_at,
});
const fullSnapshot = assertSnapshot(full);
const never = (): never => {
  throw new Error('unreachable');
};

beforeEach(() => {
  state.data = {
    snapshot: fullSnapshot,
    origin: 'synthetic-fixture',
    source: 'synthetic fixture full.json',
    skipped: [],
    read_at: READ_AT,
  };
});

const render = async (page: () => Promise<React.ReactElement>) => renderMarkup(await page());

describe('home', () => {
  it('shows the four tiles, most valuable first, each opening its drill-down', async () => {
    const html = await render(Home);
    const order = [...html.matchAll(/data-tile-slot="([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['attention', 'flow', 'spend', 'metrics']);
    for (const id of ['attention', 'flow', 'spend', 'metrics']) {
      expect(html).toMatch(new RegExp(`<a[^>]*href="/${id}"[^>]*data-part="title-link"`));
    }
    expect(html).toContain('Customise tiles');
  });

  it('links each of the top five Attention items to its deep link', async () => {
    const html = await render(Home);
    const attention = html.slice(
      html.indexOf('data-tile-slot="attention"'),
      html.indexOf('data-tile-slot="flow"'),
    );
    const links = [...attention.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(links).toHaveLength(5);
    expect(links[0]).toBe('https://example.com/orchard/cards/7');
    expect(attention).toContain('(opens example.com)');
    expect(attention).toContain('the 5 most urgent below');
    expect(attention).toMatch(/data-part="value"[^>]*>6</);
  });

  it('stamps the page: synthetic badge, data as-of, source and the last read', async () => {
    const html = await render(Home);
    expect(html).toContain('synthetic data');
    expect(html).toContain('<time dateTime="2026-01-14T15:00:00Z">2026-01-14 15:00 UTC</time>');
    expect(html).toContain('source synthetic fixture full.json');
    expect(html).toContain('<time dateTime="2026-01-14T16:00:00Z">2026-01-14 16:00 UTC</time>');
    expect(html).toContain('updates within the hour');
  });

  it('marks spend partial and shows metrics as no data', async () => {
    const html = await render(Home);
    expect(html).toContain('>partial<');
    expect(html).toContain('no scorecard source exists yet');
    expect(html).toContain('1 provider without a reading');
  });

  it('labels a source that failed or had no data on the tiles it feeds', async () => {
    state.data = fileData(
      assertSnapshot({
        ...full,
        synthetic: undefined,
        sources: [
          {
            adapter: 'github',
            status: 'failed',
            feeds: ['attention', 'flow'],
            reason: 'gh exit 1',
          },
          { adapter: 'handoff-board', status: 'no_data', feeds: ['flow'] },
        ],
      }),
    );
    const html = await render(Home);
    expect(html).toContain('partial: github failed — gh exit 1');
    expect(html).toContain('missing: handoff-board had no data');
    expect(html).not.toContain('synthetic data');
  });

  it('reads every tile as no data from an empty snapshot, never as zero', async () => {
    state.data = fileData(assertSnapshot(empty));
    const html = await render(Home);
    expect(html.match(/data-state="no-data"/g)).toHaveLength(4);
  });

  it('marks hand-typed figures manual and shows reported metrics', async () => {
    state.data = fileData(assertSnapshot(manualOnly));
    const manual = await render(Home);
    expect(manual).toContain('>manual<');
    expect(manual).toContain('manual entry');
    state.data = fileData(assertSnapshot(sparse));
    const html = await render(Home);
    expect(html).toMatch(/improving · 0 declining · 0 steady/);
    expect(html).toMatch(/1 of 16 metrics reported/);
  });

  it('says when the configured snapshot cannot be shown, or is old', async () => {
    state.data = {
      ...fileData(assertSnapshot(empty)),
      origin: 'unavailable',
      problem: 'no snapshot-*.json in the snapshot directory yet',
    };
    expect(await render(Home)).toContain(
      'The snapshot could not be shown: no snapshot-*.json in the snapshot directory yet',
    );
    state.data = fileData(fullSnapshot, '2026-01-17T15:00:00Z');
    expect(await render(Home)).toContain('This snapshot was 3d old when last read');
  });
});

describe('drill-downs', () => {
  it('attention: every eligible item ranked, each with its deep link and stamp', async () => {
    const html = await render(AttentionPage);
    expect(html.match(/data-attention-item=/g)).toHaveLength(6);
    expect(html).toContain('1 more pull request has not waited 48 hours yet.');
    expect(html).toMatch(/href="\/"[^>]*>.*Back to start/);
    expect(html).toMatch(/href="\/attention"[^>]*aria-current="page"/);
    expect(html).toContain('3 × 4 = 12');
  });

  it('flow: throughput, projects, stale items and the board', async () => {
    const html = await render(FlowPage);
    expect(html).toContain('Done this week');
    expect(html).toContain('Open pull requests and issues per project');
    expect(html).toContain('Open items not updated recently');
    expect(html).toContain('Handoff board cards by state');
  });

  it('spend: the month’s cost and each quota against its reset', async () => {
    const html = await render(SpendPage);
    expect(html).toContain('$60.00');
    expect(html).toContain('billing export not available for this provider');
    expect(html).toContain('role="meter"');
    expect(html).toContain('in 4d 9h');
  });

  it('metrics: no data until a scorecard reports, then sixteen per project', async () => {
    expect(await render(MetricsPage)).toContain('no scorecard source exists yet');
    state.data = fileData(assertSnapshot(sparse));
    const html = await render(MetricsPage);
    expect(html).toContain('Merge-priority metrics for');
    expect(html).toContain('of 16 reported');
  });

  it('every drill-down reads no data from an empty snapshot', async () => {
    state.data = fileData(assertSnapshot(empty));
    for (const page of [AttentionPage, FlowPage, SpendPage, MetricsPage]) {
      expect(await render(page)).toContain('data-state="no-data"');
    }
  });

  it('covers the quieter arms: several PRs not yet due, no cost this month, over quota', async () => {
    if (fullSnapshot.attention.state !== 'value') throw new Error('fixture');
    const fresh = (id: string) => ({
      ...(fullSnapshot.attention.state === 'value'
        ? fullSnapshot.attention.candidates[0]!
        : never()),
      id,
      kind: 'waiting_pr' as const,
      waiting_since: '2026-01-14T10:00:00Z',
    });
    state.data = fileData({
      ...fullSnapshot,
      attention: {
        ...fullSnapshot.attention,
        candidates: [...fullSnapshot.attention.candidates, fresh('new-1'), fresh('new-2')],
      },
    });
    expect(await render(AttentionPage)).toContain('3 more pull requests have not waited');

    const past = assertSnapshot(pastReset);
    state.data = fileData(past);
    const spend = await render(SpendPage);
    expect(spend).toContain('over quota');
    expect(spend).toContain('no provider reported a cost for');
    const flow = await render(FlowPage);
    expect(flow).toContain('Nothing open has gone untouched that long.');
  });

  it('names newer snapshots it had to pass over', async () => {
    state.data = {
      ...fileData(fullSnapshot),
      skipped: [
        { source: 'file:snapshot-new.json', problem: 'file:snapshot-new.json: not valid JSON' },
      ],
    };
    expect(await render(Home)).toContain(
      'the newer snapshot was unusable (file:snapshot-new.json: not valid JSON)',
    );
  });

  it('read-only: no form, no write control anywhere', async () => {
    for (const page of [Home, AttentionPage, FlowPage, SpendPage, MetricsPage]) {
      const html = await render(page);
      expect(html).not.toMatch(/<form|method="post"/i);
      // The only buttons are the layout controls; every action is a link out.
      const buttons = [...html.matchAll(/<button([^>]*)>([^<]*)</g)].map(
        ([, attributes, text]) => /aria-label="([^"]*)"/.exec(attributes!)?.[1] ?? text,
      );
      for (const label of buttons) {
        expect(label).toMatch(/^(Customise tiles|Move \w+ (up|down)|Reset layout)$/);
      }
    }
  });
});

describe('/theme preview', () => {
  const html = renderMarkup(<ThemePreview />);

  it('renders the four tiles from the synthetic fixture, labelled synthetic', () => {
    for (const title of ['Attention', 'Flow', 'Spend', 'Metrics']) {
      expect(html).toMatch(new RegExp(`<h2 id="[^"]+"[^>]*>${title}</h2>`));
    }
    expect(html).toContain('Synthetic data');
  });

  it('links each of the top five attention items to its deep link', () => {
    const links = html.match(/href="https:\/\/example\.com\/[^"]+"/g) ?? [];
    expect(links).toHaveLength(5);
    expect(links[0]).toBe('href="https://example.com/orchard/cards/7"');
  });

  it('marks theme as the current pivot and links back to start', () => {
    expect(html).toMatch(/href="\/theme"[^>]*aria-current="page"/);
    expect(html).toMatch(/<a[^>]*href="\/"/);
  });
});
