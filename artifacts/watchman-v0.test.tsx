import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildSnapshot,
  monthOf as coreMonthOf,
  monthlySpendTotal,
  parseSnapshot,
  quotaStatus,
  rankAttention as coreRank,
  staleItems,
  throughput as coreThroughput,
  type Snapshot as CoreSnapshot,
} from '@watchman/core';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ACCENTS } from '../apps/web/src/theme/palette';
import WatchmanV0, {
  METRO,
  SYNTHETIC_SNAPSHOT,
  countdownLabel,
  loadSnapshotText,
  monthOf,
  monthlyTotal,
  rankAttention,
  staleCount,
  throughput,
  validateSnapshot,
  type Snapshot,
} from './watchman-v0';

/**
 * Keeps the artifact honest with the code: it must type-check as the claude.ai runtime sees it,
 * import nothing but React, embed exactly the committed synthetic fixture, accept and refuse what
 * core accepts and refuses, and compute the same rankings and totals as core.
 */

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const ARTIFACT = here('./watchman-v0.tsx');
const SOURCE = readFileSync(ARTIFACT, 'utf8');
const FIXTURE_DIR = here('../packages/core/fixtures/synthetic/');
const FIXTURES = Object.fromEntries(
  readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(`${FIXTURE_DIR}${f}`, 'utf8')) as unknown]),
);

const asAt = (s: { generated_at: string }) => new Date(s.generated_at);
const core = (json: unknown): CoreSnapshot => {
  const r = parseSnapshot(json);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.snapshot;
};
const mine = (json: unknown): Snapshot => {
  const r = validateSnapshot(json);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.snapshot;
};
const html = (snapshot?: Snapshot) =>
  renderToStaticMarkup(snapshot === undefined ? <WatchmanV0 /> : <WatchmanV0 initial={snapshot} />);
const tile = (markup: string, id: string) => {
  const start = markup.indexOf(`data-tile="${id}"`);
  const end = markup.indexOf('</section>', start);
  return markup.slice(start, end);
};

describe('the artifact file', () => {
  it('type-checks on its own, with React and the DOM only', () => {
    const config = ts.readConfigFile(here('./tsconfig.json'), (p) => ts.sys.readFile(p));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, here('.'));
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(parsed.fileNames.map((f) => f.split('/').pop())).toEqual(['watchman-v0.tsx']);
    expect(diagnostics).toEqual([]);
  });

  it('imports only React and has one default-exported component', () => {
    const imports = [...SOURCE.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['react']);
    expect(SOURCE.match(/^export default /gm)).toHaveLength(1);
    expect(SOURCE).not.toMatch(/\brequire\(/);
  });

  it('makes no network calls and touches no browser storage', () => {
    for (const api of [
      /\bfetch\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /EventSource/,
      /navigator\.sendBeacon/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /window\.storage/,
    ]) {
      expect(SOURCE).not.toMatch(api);
    }
  });

  it('embeds exactly the committed full synthetic fixture', () => {
    expect(SYNTHETIC_SNAPSHOT).toEqual(FIXTURES['full.json']);
    expect(SYNTHETIC_SNAPSHOT.synthetic).toBe(true);
    expect(parseSnapshot(SYNTHETIC_SNAPSHOT).ok).toBe(true);
  });

  it('uses only accents from the web app’s Metro palette', () => {
    const palette = new Set<string>(Object.values(ACCENTS));
    for (const key of ['attention', 'flow', 'spend', 'metrics', 'synthetic'] as const) {
      expect(palette.has(METRO[key])).toBe(true);
    }
  });
});

describe('validation agrees with core', () => {
  it.each(Object.keys(FIXTURES))('accepts the fixture %s, as core does', (name) => {
    const r = validateSnapshot(FIXTURES[name]);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  const full = FIXTURES['full.json'] as Record<string, unknown>;
  const withAttention = (candidate: Record<string, unknown>) => ({
    ...full,
    attention: {
      state: 'value',
      source: 's',
      as_of: '2026-01-14T14:30:00Z',
      candidates: [
        {
          id: 'x',
          kind: 'owner_decision',
          title: 'Sample',
          project: 'P',
          url: 'https://example.com/x',
          value: 3,
          waiting_since: '2026-01-13T00:00:00Z',
          source: 's',
          as_of: '2026-01-14T14:30:00Z',
          ...candidate,
        },
      ],
    },
  });
  const cases: [string, unknown][] = [
    ['null', null],
    ['an array', []],
    ['another schema version', { ...full, schema_version: 2 }],
    ['an unknown top-level key', { ...full, extra: 1 }],
    ['a missing section', { ...full, metrics: undefined }],
    [
      'an unknown state',
      { ...full, metrics: { state: 'maybe', source: 's', as_of: '2026-01-14T15:00:00Z' } },
    ],
    [
      'a no_data without a reason',
      { ...full, metrics: { state: 'no_data', source: 's', as_of: '2026-01-14T15:00:00Z' } },
    ],
    [
      'a stamp later than generated_at',
      {
        ...full,
        metrics: { state: 'no_data', reason: 'r', source: 's', as_of: '2026-01-15T00:00:00Z' },
      },
    ],
    ['an http link', withAttention({ url: 'http://example.com/x' })],
    ['a javascript: link', withAttention({ url: 'javascript:alert(1)' })],
    ['a link with credentials', withAttention({ url: 'https://user:pw@example.com/x' })],
    ['a link with a token', withAttention({ url: 'https://example.com/x?token=abc' })],
    ['a bare-host link', withAttention({ url: 'https://localhost/x' })],
    ['a value out of range', withAttention({ value: 6 })],
    ['an unknown kind', withAttention({ kind: 'other' })],
    ['an over-long title', withAttention({ title: 'x'.repeat(201) })],
    ['a date without an offset', withAttention({ waiting_since: '2026-01-13T00:00:00' })],
    ['an unknown candidate key', withAttention({ extra: true })],
    [
      'a negative count',
      {
        ...full,
        flow: {
          state: 'value',
          source: 's',
          as_of: '2026-01-14T14:30:00Z',
          projects: [
            {
              project: 'P',
              open_prs: -1,
              open_issues: 0,
              source: 's',
              as_of: '2026-01-14T14:30:00Z',
            },
          ],
          work_items: [],
          board: { state: 'no_data', reason: 'r', source: 's', as_of: '2026-01-14T14:30:00Z' },
        },
      },
    ],
    [
      'a zero quota limit',
      {
        ...full,
        spend: {
          state: 'value',
          source: 's',
          as_of: '2026-01-14T14:30:00Z',
          providers: [
            {
              id: 'a',
              label: 'A',
              quota: {
                state: 'value',
                used: 1,
                limit: 0,
                unit: 'u',
                resets_at: '2026-01-19T00:00:00Z',
                source: 's',
                as_of: '2026-01-14T14:30:00Z',
              },
              monthly_cost: {
                state: 'no_data',
                reason: 'r',
                source: 's',
                as_of: '2026-01-14T14:30:00Z',
              },
            },
          ],
        },
      },
    ],
    [
      'an unknown metric',
      {
        ...full,
        metrics: {
          state: 'value',
          source: 's',
          as_of: '2026-01-14T14:30:00Z',
          projects: [
            {
              project: 'P',
              metrics: {
                Vibes: {
                  state: 'no_data',
                  reason: 'r',
                  source: 's',
                  as_of: '2026-01-14T14:30:00Z',
                },
              },
            },
          ],
        },
      },
    ],
    [
      'a series with no points',
      {
        ...full,
        metrics: {
          state: 'value',
          source: 's',
          as_of: '2026-01-14T14:30:00Z',
          projects: [
            {
              project: 'P',
              metrics: {
                Stability: {
                  state: 'value',
                  source: 's',
                  as_of: '2026-01-14T14:30:00Z',
                  points: [],
                },
              },
            },
          ],
        },
      },
    ],
  ];

  it.each(cases)('refuses %s, as core does', (_what, input) => {
    const json = JSON.parse(JSON.stringify(input ?? null)) as unknown;
    expect(parseSnapshot(json).ok).toBe(false);
    const r = validateSnapshot(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('explains pasted text it cannot load', () => {
    expect(loadSnapshotText('  ')).toEqual({ ok: false, errors: ['paste a snapshot JSON first'] });
    expect(loadSnapshotText('{ nope')).toEqual({ ok: false, errors: ['this is not valid JSON'] });
    const bad = loadSnapshotText(JSON.stringify({ ...full, schema_version: 2 }));
    expect(bad).toEqual({
      ok: false,
      errors: ['schema_version: unsupported schema_version; this artifact reads 1'],
    });
    expect(loadSnapshotText(JSON.stringify(full)).ok).toBe(true);
  });
});

describe('tile logic agrees with core', () => {
  it.each(Object.keys(FIXTURES))('%s: ranking, throughput, staleness and spend match', (name) => {
    const json = FIXTURES[name];
    const c = core(json);
    const m = mine(json);
    const now = asAt(m);
    if (c.attention.state === 'value' && m.attention.state === 'value') {
      expect(
        rankAttention(m.attention.candidates, now).map((i) => [i.id, i.score, i.waited_hours]),
      ).toEqual(coreRank(c.attention.candidates, now).map((i) => [i.id, i.score, i.waited_hours]));
    }
    if (c.flow.state === 'value' && m.flow.state === 'value') {
      const t = coreThroughput(c.flow.work_items, now);
      expect(throughput(m.flow.work_items, now)).toEqual({
        this_week: t.this_week,
        last_week: t.last_week,
        delta: t.delta,
      });
      expect(staleCount(m.flow.work_items, now)).toBe(staleItems(c.flow.work_items, now).length);
    }
    if (c.spend.state === 'value' && m.spend.state === 'value') {
      expect(monthOf(now)).toBe(coreMonthOf(now));
      const ct = monthlySpendTotal(c.spend.providers, coreMonthOf(now), c.spend.as_of);
      const mt = monthlyTotal(m.spend.providers, monthOf(now));
      if (ct.state === 'value' && mt.state === 'value') {
        expect([mt.usd, mt.cop, mt.missing, mt.stamp.as_of, mt.stamp.manual === true]).toEqual([
          ct.usd,
          ct.cop,
          ct.missing,
          ct.as_of,
          ct.manual,
        ]);
      } else expect(mt.state).toBe(ct.state);
      c.spend.providers.forEach((p) => {
        const q = quotaStatus(p.quota, now);
        if (q.state === 'value') {
          expect(countdownLabel(Date.parse(q.resets_at), now)).toBe(q.countdown.label);
        }
      });
    }
  });
});

describe('rendering', () => {
  const markup = html();

  it('shows all four tiles from one snapshot', () => {
    for (const id of ['attention', 'flow', 'spend', 'metrics'])
      expect(markup).toContain(`data-tile="${id}"`);
  });

  it('badges the synthetic sample on the page and on every tile', () => {
    expect(markup).toContain('synthetic sample — not real data');
    for (const id of ['attention', 'flow', 'spend', 'metrics'])
      expect(tile(markup, id)).toContain('>synthetic<');
  });

  it('shows a source and an as-of time beside every figure', () => {
    for (const id of ['attention', 'flow', 'spend', 'metrics']) {
      const t = tile(markup, id);
      expect(t).toMatch(
        /data-stamp=""[^]*?· as of <time dateTime="[^"]+">\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC<\/time>/,
      );
    }
    // Every ranked Attention item and every provider row carries its own stamp.
    const attention = tile(markup, 'attention');
    expect(attention.match(/<li /g)?.length).toBe(5);
    expect(attention.match(/data-stamp=""/g)?.length).toBe(5 + 1);
  });

  it('links every Attention item to its deep link, opening safely', () => {
    const attention = tile(markup, 'attention');
    const links = [
      ...attention.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer"/g),
    ].map((m) => m[1]);
    const c = core(SYNTHETIC_SNAPSHOT);
    if (c.attention.state !== 'value') throw new Error('expected attention');
    const expected = coreRank(c.attention.candidates, asAt(c)).map((i) => i.url);
    expect(links).toEqual(expected);
    expect(links).toHaveLength(5);
  });

  it('labels missing data and manual entries', () => {
    expect(tile(markup, 'metrics')).toContain('no data');
    expect(tile(markup, 'metrics')).toContain('no scorecard source exists yet');
    expect(tile(markup, 'spend')).toContain('quota: no data — provider exposes no usage reading');
    expect(tile(markup, 'spend')).toContain(
      'cost: no data — billing export not available for this provider',
    );
    expect(tile(markup, 'spend')).toContain('>manual<');
    expect(tile(markup, 'spend')).toContain('partial: 1 provider(s) have no cost');
  });

  it('renders every fixture without throwing, and the empty one as no data everywhere', () => {
    for (const json of Object.values(FIXTURES)) expect(() => html(mine(json))).not.toThrow();
    const empty = html(mine(FIXTURES['empty.json']));
    for (const id of ['attention', 'flow', 'spend', 'metrics']) {
      expect(tile(empty, id)).toContain('data-no-data=""');
    }
  });

  it('renders a metrics section with values, never inventing the missing ones', () => {
    const base = mine(FIXTURES['full.json']);
    const withMetrics = mine({
      ...base,
      metrics: {
        state: 'value',
        source: 'synthetic-scorecard',
        as_of: '2026-01-14T14:00:00Z',
        projects: [
          {
            project: 'Project Alpha',
            metrics: {
              Stability: {
                state: 'value',
                source: 'synthetic-scorecard',
                as_of: '2026-01-14T14:00:00Z',
                unit: 'score',
                points: [
                  { at: '2026-01-13T00:00:00Z', value: 70 },
                  { at: '2026-01-14T00:00:00Z', value: 72 },
                ],
              },
              Cost: {
                state: 'no_data',
                reason: 'not scored yet',
                source: 'synthetic-scorecard',
                as_of: '2026-01-14T14:00:00Z',
              },
            },
          },
        ],
      },
    });
    const t = tile(html(withMetrics), 'metrics');
    expect(t).toContain('Project Alpha · 1 of 16 reported');
    expect(t).toContain('Stability: 72 score (+2)');
    expect(t).toContain('Cost: no data — not scored yet');
    expect(t).toContain('Visibility: no data');
    const none = mine({
      ...base,
      metrics: { state: 'value', source: 's', as_of: '2026-01-14T14:00:00Z', projects: [] },
    });
    expect(tile(html(none), 'metrics')).toContain('no project reported metrics');
  });

  it('renders a snapshot built from absent sources as four labelled gaps', async () => {
    const built = await buildSnapshot({
      dir: '/synthetic/none',
      readText: () => Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      now: new Date('2026-01-14T15:00:00Z'),
    });
    const page = html(mine(JSON.parse(JSON.stringify(built.snapshot))));
    expect(page).toContain('loaded snapshot');
    expect(page).not.toContain('synthetic sample');
    expect(tile(page, 'spend')).toContain(
      'ai-surfaces-spend.json is not in the snapshot directory',
    );
    expect(tile(page, 'flow')).toContain('handoff-board.json is not in the snapshot directory');
    expect(tile(page, 'metrics')).toContain('no scorecard source exists yet');
  });

  it('lists the busiest projects first and counts the rest', () => {
    const base = mine(FIXTURES['full.json']);
    if (base.flow.state !== 'value') throw new Error('expected flow');
    const stamp = { source: 'synthetic-forge', as_of: '2026-01-14T14:30:00Z' };
    const projects = Array.from({ length: 10 }, (_, i) => ({
      project: `Sample ${String(i).padStart(2, '0')}`,
      open_prs: i % 3,
      open_issues: i,
      ...stamp,
    }));
    const t = tile(html(mine({ ...base, flow: { ...base.flow, projects } })), 'flow');
    const named = [...t.matchAll(/<div>(Sample \d\d):/g)].map((m) => m[1]);
    expect(named).toEqual([
      'Sample 08',
      'Sample 05',
      'Sample 02',
      'Sample 07',
      'Sample 04',
      'Sample 01',
      'Sample 09',
      'Sample 06',
    ]);
    expect(t).toContain('and 2 more projects, counted in the totals above');
    expect(t).toContain('9 open PRs · 45 open issues across 10 projects');
  });

  it('says when a flow has no project counts instead of showing zero', () => {
    const base = mine(FIXTURES['full.json']);
    if (base.flow.state !== 'value') throw new Error('expected flow');
    const t = tile(html(mine({ ...base, flow: { ...base.flow, projects: [] } })), 'flow');
    expect(t).toContain('open PRs and issues: no data (no project reported counts)');
  });
});
