/**
 * Watchman v0 — a single-file Claude artifact.
 *
 * Paste this whole file into a claude.ai React artifact. It renders the four Watchman tiles
 * (Attention, Flow, Spend, Metrics) from one snapshot, in the Metro / Modern UI look: flat colour
 * tiles, square corners, big light type.
 *
 * - It starts on the SYNTHETIC sample below (invented figures, example.com links), badged as such.
 * - "Load snapshot" takes a pasted snapshot JSON (from `npm run snapshot`), validates it and
 *   renders it. The pasted data stays in this page's memory: nothing is fetched, sent or stored.
 * - Every figure shows its source and as-of time; a missing source reads "no data" with its
 *   reason; hand-typed figures are marked "manual"; Metrics reads "no data" until a scorecard
 *   source exists.
 *
 * It imports nothing but React, so its validator and tile logic mirror `packages/core` by hand;
 * `artifacts/watchman-v0.test.tsx` holds the two in step (same fixture, same verdicts, same
 * rankings and totals).
 */
import { useMemo, useState, type ReactNode } from 'react';

// --- The snapshot model (mirrors packages/core/src/snapshot.ts, schema_version 1) ---------------

export type Stamp = { source: string; as_of: string; manual?: boolean };
export type NoData = { state: 'no_data'; reason: string; source: string; as_of: string };
export type Observed<T> = ({ state: 'value' } & Stamp & T) | NoData;

export type AttentionKind = 'owner_decision' | 'blocked_card' | 'waiting_pr';
export type Candidate = Stamp & {
  id: string;
  kind: AttentionKind;
  title: string;
  project: string;
  url: string;
  value: number;
  waiting_since: string;
  due_at?: string;
};
export type FlowProject = Stamp & { project: string; open_prs: number; open_issues: number };
export type WorkItem = Stamp & {
  id: string;
  project: string;
  kind: 'pr' | 'issue' | 'card';
  title: string;
  url: string;
  opened_at: string;
  updated_at: string;
  completed_at?: string;
};
export type Board = Observed<{ columns: { name: string; count: number }[] }>;
export type Quota = Observed<{
  used: number;
  limit: number;
  unit: string;
  resets_at: string;
  period_days?: number;
}>;
export type MonthlyCost = Observed<{ month: string; usd: number; cop: number }>;
export type Provider = { id: string; label: string; quota: Quota; monthly_cost: MonthlyCost };
export type MetricSeries = Observed<{ unit?: string; points: { at: string; value: number }[] }>;
export type ProjectMetrics = { project: string; metrics: Partial<Record<string, MetricSeries>> };

export type Snapshot = {
  $comment?: string;
  schema_version: 1;
  generated_at: string;
  synthetic?: boolean;
  attention: Observed<{ candidates: Candidate[] }>;
  flow: Observed<{ projects: FlowProject[]; work_items: WorkItem[]; board: Board }>;
  spend: Observed<{ providers: Provider[] }>;
  metrics: Observed<{ projects: ProjectMetrics[] }>;
};

export const METRIC_NAMES = [
  'Accessibility',
  'Autonomy',
  'Cost',
  'Experience',
  'Efficiency',
  'Maintainability',
  'Observability',
  'Portability',
  'Predictability',
  'Performance',
  'Resilience',
  'Scalability',
  'Security',
  'Stability',
  'Traceability',
  'Visibility',
];

// --- The embedded sample: packages/core/fixtures/synthetic/full.json, verbatim ----------------

export const SYNTHETIC_SNAPSHOT: Snapshot = {
  $comment:
    'SYNTHETIC fixture: invented projects, round invented figures and example.com links. No real data.',
  schema_version: 1,
  synthetic: true,
  generated_at: '2026-01-14T15:00:00Z',
  attention: {
    state: 'value',
    source: 'synthetic',
    as_of: '2026-01-14T14:30:00Z',
    candidates: [
      {
        id: 'alpha-decision-1',
        kind: 'owner_decision',
        title: 'Approve the sample onboarding copy',
        project: 'Project Alpha',
        url: 'https://example.com/alpha/decisions/1',
        value: 5,
        waiting_since: '2026-01-12T15:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'orchard-card-7',
        kind: 'blocked_card',
        title: 'Card blocked on a layout call',
        project: 'Sample Orchard',
        url: 'https://example.com/orchard/cards/7',
        value: 4,
        waiting_since: '2026-01-08T15:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'alpha-pr-12',
        kind: 'waiting_pr',
        title: 'Demo widget refactor',
        project: 'Project Alpha',
        url: 'https://example.com/alpha/pulls/12',
        value: 3,
        waiting_since: '2026-01-11T15:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'lighthouse-pr-3',
        kind: 'waiting_pr',
        title: 'Placeholder docs tweak',
        project: 'Demo Lighthouse',
        url: 'https://example.com/lighthouse/pulls/3',
        value: 2,
        waiting_since: '2026-01-13T15:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'lighthouse-decision-2',
        kind: 'owner_decision',
        title: 'Pick a name for the demo release',
        project: 'Demo Lighthouse',
        url: 'https://example.com/lighthouse/decisions/2',
        value: 2,
        waiting_since: '2026-01-14T09:00:00Z',
        due_at: '2026-01-14T20:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'orchard-card-2',
        kind: 'blocked_card',
        title: 'Sample card waiting on a stub service',
        project: 'Sample Orchard',
        url: 'https://example.com/orchard/cards/2',
        value: 1,
        waiting_since: '2026-01-04T15:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'alpha-decision-4',
        kind: 'owner_decision',
        title: 'Choose between two sample colour options',
        project: 'Project Alpha',
        url: 'https://example.com/alpha/decisions/4',
        value: 3,
        waiting_since: '2026-01-13T03:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
    ],
  },
  flow: {
    state: 'value',
    source: 'synthetic',
    as_of: '2026-01-14T14:30:00Z',
    projects: [
      {
        project: 'Project Alpha',
        open_prs: 4,
        open_issues: 10,
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        project: 'Sample Orchard',
        open_prs: 2,
        open_issues: 6,
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        project: 'Demo Lighthouse',
        open_prs: 0,
        open_issues: 3,
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
    ],
    work_items: [
      {
        id: 'alpha-pr-10',
        project: 'Project Alpha',
        kind: 'pr',
        title: 'Sample settings screen',
        url: 'https://example.com/alpha/pulls/10',
        opened_at: '2026-01-06T10:00:00Z',
        updated_at: '2026-01-12T11:00:00Z',
        completed_at: '2026-01-12T11:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'alpha-pr-11',
        project: 'Project Alpha',
        kind: 'pr',
        title: 'Demo empty state',
        url: 'https://example.com/alpha/pulls/11',
        opened_at: '2026-01-09T10:00:00Z',
        updated_at: '2026-01-13T16:00:00Z',
        completed_at: '2026-01-13T16:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'orchard-issue-20',
        project: 'Sample Orchard',
        kind: 'issue',
        title: 'Placeholder bug',
        url: 'https://example.com/orchard/issues/20',
        opened_at: '2026-01-07T10:00:00Z',
        updated_at: '2026-01-14T09:00:00Z',
        completed_at: '2026-01-14T09:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'orchard-pr-5',
        project: 'Sample Orchard',
        kind: 'pr',
        title: 'Sample import cleanup',
        url: 'https://example.com/orchard/pulls/5',
        opened_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-07T10:00:00Z',
        completed_at: '2026-01-07T10:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'lighthouse-issue-8',
        project: 'Demo Lighthouse',
        kind: 'issue',
        title: 'Demo typo',
        url: 'https://example.com/lighthouse/issues/8',
        opened_at: '2026-01-03T10:00:00Z',
        updated_at: '2026-01-09T10:00:00Z',
        completed_at: '2026-01-09T10:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'alpha-issue-31',
        project: 'Project Alpha',
        kind: 'issue',
        title: 'Sample flaky check',
        url: 'https://example.com/alpha/issues/31',
        opened_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-05T10:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'orchard-card-9',
        project: 'Sample Orchard',
        kind: 'card',
        title: 'Sample card parked in review',
        url: 'https://example.com/orchard/cards/9',
        opened_at: '2026-01-05T10:00:00Z',
        updated_at: '2026-01-10T10:00:00Z',
        source: 'synthetic-board',
        as_of: '2026-01-14T14:30:00Z',
      },
      {
        id: 'alpha-pr-13',
        project: 'Project Alpha',
        kind: 'pr',
        title: 'Demo tile spacing',
        url: 'https://example.com/alpha/pulls/13',
        opened_at: '2026-01-13T10:00:00Z',
        updated_at: '2026-01-14T12:00:00Z',
        source: 'synthetic-forge',
        as_of: '2026-01-14T14:30:00Z',
      },
    ],
    board: {
      state: 'value',
      source: 'synthetic-board',
      as_of: '2026-01-14T14:30:00Z',
      columns: [
        {
          name: 'Backlog',
          count: 6,
        },
        {
          name: 'In progress',
          count: 3,
        },
        {
          name: 'Blocked',
          count: 2,
        },
        {
          name: 'Done',
          count: 10,
        },
      ],
    },
  },
  spend: {
    state: 'value',
    source: 'synthetic',
    as_of: '2026-01-14T14:00:00Z',
    providers: [
      {
        id: 'sample-a',
        label: 'Sample Provider A',
        quota: {
          state: 'value',
          used: 40,
          limit: 100,
          unit: 'percent',
          resets_at: '2026-01-19T00:00:00Z',
          source: 'synthetic-usage',
          as_of: '2026-01-14T14:00:00Z',
        },
        monthly_cost: {
          state: 'value',
          month: '2026-01',
          usd: 20,
          cop: 80000,
          source: 'synthetic-billing',
          as_of: '2026-01-14T14:00:00Z',
        },
      },
      {
        id: 'sample-b',
        label: 'Sample Provider B',
        quota: {
          state: 'value',
          used: 300,
          limit: 500,
          unit: 'messages',
          resets_at: '2026-01-16T12:00:00Z',
          source: 'synthetic-usage',
          as_of: '2026-01-14T14:00:00Z',
        },
        monthly_cost: {
          state: 'no_data',
          reason: 'billing export not available for this provider',
          source: 'synthetic-billing',
          as_of: '2026-01-14T14:00:00Z',
        },
      },
      {
        id: 'sample-c',
        label: 'Sample Provider C',
        quota: {
          state: 'no_data',
          reason: 'provider exposes no usage reading',
          source: 'synthetic-usage',
          as_of: '2026-01-14T14:00:00Z',
        },
        monthly_cost: {
          state: 'value',
          month: '2026-01',
          usd: 10,
          cop: 40000,
          manual: true,
          source: 'manual entry',
          as_of: '2026-01-13T12:00:00Z',
        },
      },
      {
        id: 'sample-d',
        label: 'Sample Provider D',
        quota: {
          state: 'value',
          used: 90,
          limit: 100,
          unit: 'percent',
          resets_at: '2026-01-13T00:00:00Z',
          source: 'synthetic-usage',
          as_of: '2026-01-14T14:00:00Z',
        },
        monthly_cost: {
          state: 'value',
          month: '2026-01',
          usd: 30,
          cop: 120000,
          source: 'synthetic-billing',
          as_of: '2026-01-14T14:00:00Z',
        },
      },
    ],
  },
  metrics: {
    state: 'no_data',
    reason: 'no scorecard source exists yet',
    source: 'synthetic',
    as_of: '2026-01-14T15:00:00Z',
  },
};

// --- Validation (mirrors parseSnapshot) ---------------------------------------------------------

export type ParseResult = { ok: true; snapshot: Snapshot } | { ok: false; errors: string[] };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const CREDENTIAL_QUERY =
  /[?&](?:token|access_token|id_token|refresh_token|api_key|apikey|key|sig|signature|auth|password|secret)=/i;
const AS_OF_SKEW_MS = 5 * 60 * 1000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isLabel = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const isIso = (v: unknown) => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function isDeepLink(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    HOST.test(url.hostname) &&
    !/^https:\/\/[^/?#]*@/i.test(v) &&
    !CREDENTIAL_QUERY.test(v)
  );
}

type Field = (value: unknown, path: string, errors: string[]) => void;
const need =
  (test: (v: unknown) => boolean, message: string): Field =>
  (value, path, errors) => {
    if (!test(value)) errors.push(`${path}: ${message}`);
  };
const label = need(isLabel, 'expected a non-empty string');
const title = need(
  (v) => isLabel(v) && (v as string).length <= 200,
  'expected a title of 1–200 characters',
);
const iso = need(isIso, 'expected an ISO 8601 date-time with an offset');
const count = need((v) => isInt(v) && (v as number) >= 0, 'expected a whole number ≥ 0');
const link = need(isDeepLink, 'expected an https link with no credentials');
const optional =
  (field: Field): Field =>
  (value, path, errors) => {
    if (value !== undefined) field(value, path, errors);
  };
const oneOf = (values: readonly string[]) =>
  need((v) => typeof v === 'string' && values.includes(v), `expected one of ${values.join(', ')}`);

function record(shape: Record<string, Field>): Field {
  return (value, path, errors) => {
    if (!isObj(value)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) errors.push(`${path}.${key}: unknown key`);
    }
    for (const [key, field] of Object.entries(shape)) field(value[key], `${path}.${key}`, errors);
  };
}

function list(item: Field, min = 0): Field {
  return (value, path, errors) => {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected a list`);
      return;
    }
    if (value.length < min) errors.push(`${path}: expected at least ${min} item(s)`);
    value.forEach((v, i) => item(v, `${path}[${i}]`, errors));
  };
}

const provenance = {
  source: label,
  as_of: iso,
  manual: optional(need((v) => typeof v === 'boolean', 'expected true or false')),
};
const noDataShape = {
  state: need((v) => v === 'no_data', 'expected no_data'),
  reason: label,
  source: label,
  as_of: iso,
};

function observed(shape: Record<string, Field>): Field {
  const valueRecord = record({
    state: need((v) => v === 'value', 'expected value'),
    ...provenance,
    ...shape,
  });
  const noDataRecord = record(noDataShape);
  return (value, path, errors) => {
    const state = isObj(value) ? value.state : undefined;
    if (state === 'value') valueRecord(value, path, errors);
    else if (state === 'no_data') noDataRecord(value, path, errors);
    else errors.push(`${path}.state: expected "value" or "no_data"`);
  };
}

const candidateField = record({
  id: label,
  kind: oneOf(['owner_decision', 'blocked_card', 'waiting_pr']),
  title,
  project: label,
  url: link,
  value: need(
    (v) => isInt(v) && (v as number) >= 1 && (v as number) <= 5,
    'expected a whole number 1–5',
  ),
  waiting_since: iso,
  due_at: optional(iso),
  ...provenance,
});
const projectField = record({ project: label, open_prs: count, open_issues: count, ...provenance });
const workItemField = record({
  id: label,
  project: label,
  kind: oneOf(['pr', 'issue', 'card']),
  title,
  url: link,
  opened_at: iso,
  updated_at: iso,
  completed_at: optional(iso),
  ...provenance,
});
const boardField = observed({ columns: list(record({ name: label, count })) });
const quotaField = observed({
  used: need((v) => isNum(v) && (v as number) >= 0, 'expected a number ≥ 0'),
  limit: need((v) => isNum(v) && (v as number) > 0, 'expected a number > 0'),
  unit: label,
  resets_at: iso,
  period_days: optional(need((v) => isInt(v) && (v as number) > 0, 'expected a whole number > 0')),
});
const costField = observed({
  month: need(
    (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
    'expected a YYYY-MM month',
  ),
  usd: need((v) => isNum(v) && (v as number) >= 0, 'expected a number ≥ 0'),
  cop: need((v) => isNum(v) && (v as number) >= 0, 'expected a number ≥ 0'),
});
const seriesField = observed({
  unit: optional(label),
  points: list(record({ at: iso, value: need(isNum, 'expected a number') }), 1),
});
const metricsMapField: Field = (value, path, errors) => {
  if (!isObj(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  for (const [name, series] of Object.entries(value)) {
    if (!METRIC_NAMES.includes(name))
      errors.push(`${path}.${name}: not one of the sixteen metrics`);
    else seriesField(series, `${path}.${name}`, errors);
  }
};

const snapshotField = record({
  $comment: optional(need((v) => typeof v === 'string', 'expected a string')),
  schema_version: need((v) => v === 1, 'unsupported schema_version; this artifact reads 1'),
  generated_at: iso,
  synthetic: optional(need((v) => typeof v === 'boolean', 'expected true or false')),
  attention: observed({ candidates: list(candidateField) }),
  flow: observed({
    projects: list(projectField),
    work_items: list(workItemField),
    board: boardField,
  }),
  spend: observed({
    providers: list(record({ id: label, label, quota: quotaField, monthly_cost: costField })),
  }),
  metrics: observed({
    projects: list(record({ project: label, metrics: metricsMapField })),
  }),
});

function laterAsOf(node: unknown, limit: number, path: string, errors: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => laterAsOf(child, limit, `${path}[${i}]`, errors));
    return;
  }
  if (!isObj(node)) return;
  for (const [key, child] of Object.entries(node)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (key === 'as_of' && typeof child === 'string') {
      if (Date.parse(child) > limit) errors.push(`${at}: as_of is later than generated_at`);
    } else laterAsOf(child, limit, at, errors);
  }
}

/** Validates an already-decoded value as a snapshot. Never throws. */
export function validateSnapshot(input: unknown): ParseResult {
  const errors: string[] = [];
  snapshotField(input, '(root)', errors);
  const cleaned = errors.map((e) => e.replace(/^\(root\)\./, ''));
  if (cleaned.length > 0) return { ok: false, errors: cleaned };
  const snapshot = input as Snapshot;
  laterAsOf(snapshot, Date.parse(snapshot.generated_at) + AS_OF_SKEW_MS, '', errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, snapshot };
}

/** Decodes and validates pasted text. */
export function loadSnapshotText(text: string): ParseResult {
  if (text.trim() === '') return { ok: false, errors: ['paste a snapshot JSON first'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['this is not valid JSON'] };
  }
  return validateSnapshot(json);
}

// --- Tile logic (mirrors attention.ts, flow.ts, spend.ts, provenance.ts, time.ts) --------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const ATTENTION_LIMIT = 5;
export const STALE_AFTER_DAYS = 3;
/** How many projects the Flow tile lists by name. */
export const BUSIEST_PROJECTS = 8;
const ms = (iso: string) => Date.parse(iso);
const KIND_ORDER: Record<AttentionKind, number> = {
  owner_decision: 0,
  blocked_card: 1,
  waiting_pr: 2,
};
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function combineStamps(records: readonly Stamp[]): Stamp {
  const sources = [...new Set(records.map((r) => r.source))].sort();
  let oldest = records[0]!.as_of;
  for (const r of records) if (ms(r.as_of) < ms(oldest)) oldest = r.as_of;
  const manual = records.some((r) => r.manual === true);
  return { source: sources.join(' + '), as_of: oldest, ...(manual ? { manual: true } : {}) };
}

function urgencyOf(c: Candidate, now: number): number {
  const hours = Math.max(0, (now - ms(c.waiting_since)) / HOUR);
  let urgency = hours < 24 ? 1 : hours < 48 ? 2 : hours < 72 ? 3 : hours < 168 ? 4 : 5;
  if (c.due_at !== undefined) {
    const left = ms(c.due_at) - now;
    if (left < DAY) urgency = 5;
    else if (left < 3 * DAY) urgency = Math.max(urgency, 4);
  }
  return urgency;
}

export type Ranked = Candidate & { score: number; urgency: number; waited_hours: number };

export function rankAttention(candidates: readonly Candidate[], nowDate: Date): Ranked[] {
  const now = nowDate.getTime();
  const seen = new Set<string>();
  const ranked: Ranked[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (c.kind === 'waiting_pr' && now - ms(c.waiting_since) <= 48 * HOUR) continue;
    const urgency = urgencyOf(c, now);
    const waited = Math.floor(Math.max(0, (now - ms(c.waiting_since)) / HOUR));
    ranked.push({ ...c, urgency, score: c.value * urgency, waited_hours: waited });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.value - a.value ||
      ms(a.waiting_since) - ms(b.waiting_since) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      compareText(a.id, b.id),
  );
  return ranked.slice(0, ATTENTION_LIMIT);
}

/** Start of this week and last (Monday, UTC). */
function weekStarts(now: Date): [number, number] {
  const since = (now.getUTCDay() - 1 + 7) % 7;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - since);
  return [start, start - 7 * DAY];
}

export function throughput(items: readonly WorkItem[], now: Date) {
  const [thisStart, lastStart] = weekStarts(now);
  let thisWeek = 0;
  let lastWeek = 0;
  for (const item of items) {
    if (item.completed_at === undefined) continue;
    const at = ms(item.completed_at);
    if (at >= thisStart && at <= now.getTime()) thisWeek += 1;
    else if (at >= lastStart && at < thisStart) lastWeek += 1;
  }
  return { this_week: thisWeek, last_week: lastWeek, delta: thisWeek - lastWeek };
}

export function staleCount(items: readonly WorkItem[], now: Date): number {
  return items.filter(
    (i) =>
      i.completed_at === undefined && now.getTime() - ms(i.updated_at) > STALE_AFTER_DAYS * DAY,
  ).length;
}

function nextReset(resetsAt: string, now: Date, periodDays: number): number {
  const period = periodDays * DAY;
  let at = ms(resetsAt);
  if (at <= now.getTime()) at += Math.floor((now.getTime() - at) / period + 1) * period;
  return at;
}

export function countdownLabel(target: number, now: Date): string {
  const total = Math.max(0, target - now.getTime());
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return total > 0 ? '<1m' : 'now';
}

export const monthOf = (now: Date) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

export type MonthlyTotal =
  | { state: 'value'; usd: number; cop: number; missing: string[]; stamp: Stamp }
  | { state: 'no_data'; reason: string };

export function monthlyTotal(providers: readonly Provider[], month: string): MonthlyTotal {
  const included: Stamp[] = [];
  const missing: string[] = [];
  let usd = 0;
  let cop = 0;
  for (const p of providers) {
    const c = p.monthly_cost;
    if (c.state !== 'value' || c.month !== month) {
      missing.push(p.id);
      continue;
    }
    usd += c.usd;
    cop += c.cop;
    included.push(c);
  }
  if (included.length === 0)
    return { state: 'no_data', reason: `no provider reported a cost for ${month}` };
  return {
    state: 'value',
    usd: Math.round(usd * 100) / 100,
    cop: Math.round(cop),
    missing,
    stamp: combineStamps(included),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function formatAsOf(iso: string): string {
  const d = new Date(ms(iso));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
export const formatUsd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatCop = (n: number) => `COP ${Math.round(n).toLocaleString('en-US')}`;
const formatNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function describeAge(iso: string, now: Date): string {
  const age = now.getTime() - ms(iso);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  return `${Math.floor(age / DAY)}d ago`;
}

const waited = (hours: number) => (hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`);

// --- The Metro look -----------------------------------------------------------------------------

/** Accents from apps/web's palette (every one is WCAG AA with white text). */
export const METRO = {
  attention: '#C3006A',
  flow: '#0050EF',
  spend: '#00827F',
  metrics: '#8E00D6',
  synthetic: '#9E6A00',
  canvas: '#141414',
  noData: '#333333',
  fg: '#FFFFFF',
  fgMuted: '#B8B8B8',
  border: '#3D3D3D',
};

const FONT =
  '"Segoe UI", "Segoe UI Web (West European)", Selawik, "Open Sans", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

const styles = {
  page: {
    minHeight: '100vh',
    background: METRO.canvas,
    color: METRO.fg,
    fontFamily: FONT,
    padding: '2rem 1.5rem 3rem',
    boxSizing: 'border-box' as const,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 20rem), 1fr))',
    gap: '0.5rem',
    alignItems: 'start',
  },
  tileTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  figure: { fontSize: '3.5rem', fontWeight: 300, lineHeight: 1, margin: '0.75rem 0 0.25rem' },
  caption: { fontSize: '0.875rem', lineHeight: 1.4, opacity: 0.92 },
  list: { listStyle: 'none', margin: '0.75rem 0 0', padding: 0 },
  row: { padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.28)' },
  link: {
    color: METRO.fg,
    textDecoration: 'underline',
    textUnderlineOffset: '0.2em',
    fontSize: '1rem',
    display: 'inline-block',
    minHeight: '1.5rem',
  },
  button: {
    background: 'transparent',
    color: METRO.fg,
    border: `2px solid ${METRO.fg}`,
    borderRadius: 0,
    padding: '0.5rem 1rem',
    minHeight: '2.75rem',
    fontFamily: FONT,
    fontSize: '1rem',
    cursor: 'pointer',
  },
};

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '0.1rem 0.4rem',
        marginLeft: '0.4rem',
        background: color ?? 'transparent',
        border: `1px solid ${METRO.fg}`,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </span>
  );
}

/** "source · as of 2026-01-14 14:30 UTC [manual]": the stamp every figure carries. */
function StampLine({ stamp, prefix }: { stamp: Stamp; prefix?: string }) {
  return (
    <div style={styles.caption} data-stamp="">
      {prefix ? `${prefix} · ` : ''}
      <span>{stamp.source}</span>
      {' · as of '}
      <time dateTime={stamp.as_of}>{formatAsOf(stamp.as_of)}</time>
      {stamp.manual === true ? <Badge>manual</Badge> : null}
    </div>
  );
}

function NoDataBlock({ record, what }: { record: NoData; what?: string }) {
  return (
    <div data-no-data="">
      <div style={{ ...styles.figure, fontSize: '2.25rem' }}>no data</div>
      <div style={styles.caption}>
        {what ? `${what}: ` : ''}
        {record.reason}
      </div>
      <StampLine stamp={record} prefix="asked" />
    </div>
  );
}

function Tile({
  id,
  name,
  color,
  missing,
  stamp,
  synthetic,
  children,
}: {
  id: string;
  name: string;
  color: string;
  missing: boolean;
  stamp: Stamp;
  synthetic: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-tile={id}
      style={{
        background: missing
          ? `repeating-linear-gradient(135deg, ${METRO.noData} 0 12px, #3B3B3B 12px 24px)`
          : color,
        padding: '1rem 1.25rem 1.25rem',
        minHeight: '20rem',
        boxSizing: 'border-box',
      }}
    >
      <h2 id={`${id}-title`} style={styles.tileTitle}>
        {name}
        {synthetic ? <Badge color={METRO.synthetic}>synthetic</Badge> : null}
      </h2>
      {children}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '0.5rem',
          borderTop: '2px solid rgba(255,255,255,0.5)',
        }}
      >
        <StampLine stamp={stamp} prefix="tile" />
      </div>
    </section>
  );
}

const KIND_LABEL: Record<AttentionKind, string> = {
  owner_decision: 'needs your yes',
  blocked_card: 'blocked card',
  waiting_pr: 'PR waiting',
};

function AttentionTile({ snapshot, now }: { snapshot: Snapshot; now: Date }) {
  const section = snapshot.attention;
  const synthetic = snapshot.synthetic === true;
  if (section.state === 'no_data') {
    return (
      <Tile
        id="attention"
        name="Attention"
        color={METRO.attention}
        missing
        stamp={section}
        synthetic={synthetic}
      >
        <NoDataBlock record={section} />
      </Tile>
    );
  }
  const items = rankAttention(section.candidates, now);
  const stamp = combineStamps([section, ...items]);
  return (
    <Tile
      id="attention"
      name="Attention"
      color={METRO.attention}
      missing={false}
      stamp={stamp}
      synthetic={synthetic}
    >
      <div style={styles.figure} data-figure="attention">
        {items.length}
      </div>
      <div style={styles.caption}>
        {items.length === 0
          ? 'nothing is waiting on you'
          : `top ${items.length} waiting on you, most urgent first`}
      </div>
      <ol style={styles.list}>
        {items.map((item) => (
          <li key={item.id} style={styles.row}>
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {item.title}
            </a>
            <div style={styles.caption}>
              {item.project} · {KIND_LABEL[item.kind]} · waited {waited(item.waited_hours)}
              {item.due_at ? ` · due ${formatAsOf(item.due_at)}` : ''}
            </div>
            <StampLine stamp={item} />
          </li>
        ))}
      </ol>
    </Tile>
  );
}

function FlowTile({ snapshot, now }: { snapshot: Snapshot; now: Date }) {
  const section = snapshot.flow;
  const synthetic = snapshot.synthetic === true;
  if (section.state === 'no_data') {
    return (
      <Tile id="flow" name="Flow" color={METRO.flow} missing stamp={section} synthetic={synthetic}>
        <NoDataBlock record={section} />
      </Tile>
    );
  }
  const t = throughput(section.work_items, now);
  const stale = staleCount(section.work_items, now);
  const openPrs = section.projects.reduce((n, p) => n + p.open_prs, 0);
  const openIssues = section.projects.reduce((n, p) => n + p.open_issues, 0);
  const stamp = combineStamps([section, ...section.projects, ...section.work_items]);
  const arrow = t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '=';
  // Pareto: the projects with the most open work first; the rest are in the totals.
  const busiest = [...section.projects]
    .sort(
      (a, b) =>
        b.open_prs - a.open_prs ||
        b.open_issues - a.open_issues ||
        compareText(a.project, b.project),
    )
    .slice(0, BUSIEST_PROJECTS);
  return (
    <Tile
      id="flow"
      name="Flow"
      color={METRO.flow}
      missing={false}
      stamp={stamp}
      synthetic={synthetic}
    >
      <div style={styles.figure} data-figure="flow">
        {t.this_week}
      </div>
      <div style={styles.caption}>
        done this week · {t.last_week} last week ({arrow} {t.delta > 0 ? `+${t.delta}` : t.delta})
      </div>
      <div style={{ ...styles.caption, marginTop: '0.5rem' }}>
        {section.projects.length === 0
          ? 'open PRs and issues: no data (no project reported counts)'
          : `${openPrs} open PRs · ${openIssues} open issues across ${section.projects.length} projects`}
        {` · ${stale} stale (untouched > ${STALE_AFTER_DAYS} days)`}
      </div>
      <h3 style={{ ...styles.tileTitle, fontSize: '0.875rem', marginTop: '1rem' }}>Board</h3>
      {section.board.state === 'no_data' ? (
        <NoDataBlock record={section.board} what="board" />
      ) : (
        <>
          <ul style={styles.list}>
            {section.board.columns.map((c) => (
              <li
                key={c.name}
                style={{ ...styles.row, display: 'flex', justifyContent: 'space-between' }}
              >
                <span>{c.name}</span>
                <span style={{ fontWeight: 300, fontSize: '1.25rem' }}>{c.count}</span>
              </li>
            ))}
          </ul>
          <StampLine stamp={section.board} />
        </>
      )}
      <h3 style={{ ...styles.tileTitle, fontSize: '0.875rem', marginTop: '1rem' }}>
        Busiest projects
      </h3>
      <ul style={styles.list}>
        {busiest.map((p) => (
          <li key={p.project} style={styles.row}>
            <div>
              {p.project}: {p.open_prs} open PRs · {p.open_issues} open issues
            </div>
            <StampLine stamp={p} />
          </li>
        ))}
      </ul>
      {section.projects.length > busiest.length ? (
        <div style={{ ...styles.caption, marginTop: '0.5rem' }}>
          and {section.projects.length - busiest.length} more projects, counted in the totals above
        </div>
      ) : null}
    </Tile>
  );
}

function SpendTile({ snapshot, now }: { snapshot: Snapshot; now: Date }) {
  const section = snapshot.spend;
  const synthetic = snapshot.synthetic === true;
  if (section.state === 'no_data') {
    return (
      <Tile
        id="spend"
        name="Spend"
        color={METRO.spend}
        missing
        stamp={section}
        synthetic={synthetic}
      >
        <NoDataBlock record={section} />
      </Tile>
    );
  }
  const month = monthOf(now);
  const total = monthlyTotal(section.providers, month);
  const quotas = section.providers.map((p) => p.quota);
  const stamp = combineStamps([
    section,
    ...quotas,
    ...(total.state === 'value' ? [total.stamp] : []),
  ]);
  return (
    <Tile
      id="spend"
      name="Spend"
      color={METRO.spend}
      missing={false}
      stamp={stamp}
      synthetic={synthetic}
    >
      {total.state === 'value' ? (
        <>
          <div style={styles.figure} data-figure="spend">
            {formatUsd(total.usd)}
          </div>
          <div style={styles.caption}>
            {formatCop(total.cop)} · {month}
            {total.missing.length > 0
              ? ` · partial: ${total.missing.length} provider(s) have no cost`
              : ''}
          </div>
          <StampLine stamp={total.stamp} prefix="total" />
        </>
      ) : (
        <NoDataBlock
          record={{
            state: 'no_data',
            reason: total.reason,
            source: section.source,
            as_of: section.as_of,
          }}
          what={`cost for ${month}`}
        />
      )}
      <ul style={styles.list}>
        {section.providers.map((p) => {
          const q = p.quota;
          const c = p.monthly_cost;
          return (
            <li key={p.id} style={styles.row}>
              <div style={{ fontSize: '1.125rem' }}>{p.label}</div>
              {q.state === 'value' ? (
                <>
                  <div
                    role="img"
                    aria-label={`${Math.round((q.used / q.limit) * 100)}% of quota used`}
                    style={{
                      height: '0.5rem',
                      background: 'rgba(255,255,255,0.3)',
                      margin: '0.25rem 0',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (q.used / q.limit) * 100)}%`,
                        background: METRO.fg,
                      }}
                    />
                  </div>
                  <div style={styles.caption}>
                    {formatNumber(q.used)} of {formatNumber(q.limit)} {q.unit} (
                    {Math.round((q.used / q.limit) * 100)}%{q.used > q.limit ? ', exceeded' : ''}) ·
                    resets in {countdownLabel(nextReset(q.resets_at, now, q.period_days ?? 7), now)}
                  </div>
                  <StampLine stamp={q} prefix="quota" />
                </>
              ) : (
                <div style={styles.caption}>
                  quota: no data — {q.reason}
                  <StampLine stamp={q} prefix="asked" />
                </div>
              )}
              {c.state === 'value' ? (
                <>
                  <div style={styles.caption}>
                    {c.month}: {formatUsd(c.usd)} · {formatCop(c.cop)}
                  </div>
                  <StampLine stamp={c} prefix="cost" />
                </>
              ) : (
                <div style={styles.caption}>
                  cost: no data — {c.reason}
                  <StampLine stamp={c} prefix="asked" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

function MetricsTile({ snapshot }: { snapshot: Snapshot }) {
  const section = snapshot.metrics;
  const synthetic = snapshot.synthetic === true;
  if (section.state === 'no_data') {
    return (
      <Tile
        id="metrics"
        name="Metrics"
        color={METRO.metrics}
        missing
        stamp={section}
        synthetic={synthetic}
      >
        <NoDataBlock record={section} />
      </Tile>
    );
  }
  return (
    <Tile
      id="metrics"
      name="Metrics"
      color={METRO.metrics}
      missing={false}
      stamp={section}
      synthetic={synthetic}
    >
      {section.projects.length === 0 ? (
        <NoDataBlock
          record={{
            state: 'no_data',
            reason: 'no project reported metrics',
            source: section.source,
            as_of: section.as_of,
          }}
        />
      ) : null}
      <ul style={styles.list}>
        {section.projects.map((p) => {
          const reported = METRIC_NAMES.filter((name) => p.metrics[name]?.state === 'value');
          return (
            <li key={p.project} style={styles.row}>
              <div style={{ fontSize: '1.125rem' }}>
                {p.project} · {reported.length} of 16 reported
              </div>
              {METRIC_NAMES.map((name) => {
                const series = p.metrics[name];
                if (series === undefined || series.state === 'no_data') {
                  return (
                    <div key={name} style={styles.caption}>
                      {name}: no data{series ? ` — ${series.reason}` : ''}
                    </div>
                  );
                }
                const points = [...series.points].sort((a, b) => ms(a.at) - ms(b.at));
                const last = points[points.length - 1]!;
                const before = points.length > 1 ? points[points.length - 2] : undefined;
                const delta = before ? last.value - before.value : null;
                return (
                  <div key={name}>
                    <div style={styles.caption}>
                      {name}: {formatNumber(last.value)}
                      {series.unit ? ` ${series.unit}` : ''}
                      {delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${formatNumber(delta)})`}
                    </div>
                    <StampLine stamp={series} />
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

function LoadPanel({ onLoad, onReset }: { onLoad: (s: Snapshot) => void; onReset: () => void }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const load = () => {
    const result = loadSnapshotText(text);
    if (result.ok) {
      setErrors([]);
      onLoad(result.snapshot);
    } else setErrors(result.errors);
  };
  return (
    <div
      style={{
        background: '#1F1F1F',
        padding: '1rem',
        margin: '0 0 1rem',
        border: `1px solid ${METRO.border}`,
      }}
    >
      <label htmlFor="snapshot-json" style={{ display: 'block', marginBottom: '0.5rem' }}>
        Paste a snapshot JSON (from <code>npm run snapshot</code>). It stays in this page; nothing
        is sent or saved.
      </label>
      <textarea
        id="snapshot-json"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: METRO.canvas,
          color: METRO.fg,
          border: `1px solid ${METRO.border}`,
          borderRadius: 0,
          fontFamily: 'Consolas, ui-monospace, Menlo, monospace',
          fontSize: '0.875rem',
          padding: '0.5rem',
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={load}
          style={{ ...styles.button, background: METRO.flow, borderColor: METRO.flow }}
        >
          Render this snapshot
        </button>
        <button
          type="button"
          onClick={() => {
            setErrors([]);
            setText('');
            onReset();
          }}
          style={styles.button}
        >
          Back to the synthetic sample
        </button>
      </div>
      {errors.length > 0 ? (
        <div
          role="alert"
          style={{ marginTop: '0.75rem', borderLeft: '4px solid #C50F00', paddingLeft: '0.75rem' }}
        >
          <strong>This snapshot was not loaded.</strong> {errors.length} problem(s):
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {errors.length > 8 ? <div>and {errors.length - 8} more</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The artifact. The runtime renders it with no props, so it opens on the synthetic sample. */
export default function WatchmanV0({ initial = SYNTHETIC_SNAPSHOT }: { initial?: Snapshot }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [loading, setLoading] = useState(false);
  // Every tile is evaluated at the instant the snapshot was taken, so rankings, staleness and
  // countdowns agree with the figures beside them.
  const asAt = useMemo(() => new Date(snapshot.generated_at), [snapshot]);
  const synthetic = snapshot.synthetic === true;
  return (
    <main style={styles.page}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: 'clamp(2.75rem, 8vw, 4.5rem)',
            fontWeight: 300,
            lineHeight: 1,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          watchman
        </h1>
        <nav
          aria-label="Views"
          style={{
            display: 'flex',
            gap: '1.5rem',
            fontSize: '1.75rem',
            fontWeight: 300,
            margin: '0.5rem 0',
          }}
        >
          <span aria-current="page">start</span>
          <span style={{ color: METRO.fgMuted }}>v0 · read-only</span>
        </nav>
        <div style={{ ...styles.caption, color: METRO.fgMuted, opacity: 1 }}>
          Snapshot taken{' '}
          <time dateTime={snapshot.generated_at}>{formatAsOf(snapshot.generated_at)}</time> (
          {describeAge(snapshot.generated_at, new Date())}); every tile is shown as at that time.
          {synthetic ? (
            <Badge color={METRO.synthetic}>synthetic sample — not real data</Badge>
          ) : (
            <Badge>loaded snapshot</Badge>
          )}
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            aria-expanded={loading}
            onClick={() => setLoading((v) => !v)}
            style={styles.button}
          >
            {loading ? 'Close' : 'Load snapshot'}
          </button>
        </div>
      </header>
      {loading ? (
        <LoadPanel
          onLoad={(s) => {
            setSnapshot(s);
            setLoading(false);
          }}
          onReset={() => {
            setSnapshot(SYNTHETIC_SNAPSHOT);
            setLoading(false);
          }}
        />
      ) : null}
      <div style={styles.grid}>
        <AttentionTile snapshot={snapshot} now={asAt} />
        <FlowTile snapshot={snapshot} now={asAt} />
        <SpendTile snapshot={snapshot} now={asAt} />
        <MetricsTile snapshot={snapshot} />
      </div>
    </main>
  );
}
