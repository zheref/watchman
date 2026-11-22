import { z } from 'zod';
import { deepLink, isoDateTime, noDataSchema, observed, provenanceShape } from './provenance';

/**
 * The Watchman snapshot: one versioned document with the four sections the dashboard shows.
 * Producers (source adapters, `npm run snapshot` later) write it; every consumer — the web app,
 * the MCP server, the mobile app, the artifact — reads it through {@link parseSnapshot}.
 *
 * Bump {@link SNAPSHOT_SCHEMA_VERSION} on any change a reader of the previous version would
 * misread; the parser refuses every version it does not know.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

const label = z.string().trim().min(1);
const count = z.int().nonnegative();

// --- Attention ---------------------------------------------------------------------------------

/** Why an item is waiting on the owner. */
export const ATTENTION_KINDS = ['owner_decision', 'blocked_card', 'waiting_pr'] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const attentionCandidateSchema = z.strictObject({
  id: label,
  kind: z.enum(ATTENTION_KINDS),
  title: label.max(200),
  project: label,
  /** Where the owner revises, halts or unblocks it. Required: an item with no link is not shown. */
  url: deepLink,
  /** Business value as the source rates it, 1 (low) to 5 (high). */
  value: z.int().min(1).max(5),
  /** Since when it has been waiting on the owner. */
  waiting_since: isoDateTime,
  /** An explicit deadline, when the source has one. */
  due_at: isoDateTime.optional(),
  ...provenanceShape,
});
export type AttentionCandidate = z.infer<typeof attentionCandidateSchema>;

export const attentionSectionSchema = observed({
  candidates: z.array(attentionCandidateSchema),
});
export type AttentionSection = z.infer<typeof attentionSectionSchema>;

// --- Flow ----------------------------------------------------------------------------------------

export const flowProjectSchema = z.strictObject({
  project: label,
  open_prs: count,
  open_issues: count,
  ...provenanceShape,
});
export type FlowProject = z.infer<typeof flowProjectSchema>;

export const WORK_ITEM_KINDS = ['pr', 'issue', 'card'] as const;

export const workItemSchema = z.strictObject({
  id: label,
  project: label,
  kind: z.enum(WORK_ITEM_KINDS),
  title: label.max(200),
  url: deepLink,
  opened_at: isoDateTime,
  updated_at: isoDateTime,
  /** Set once the item is merged, closed or done; absent while it is open. */
  completed_at: isoDateTime.optional(),
  ...provenanceShape,
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const boardSchema = observed({
  columns: z.array(z.strictObject({ name: label, count })),
});
export type Board = z.infer<typeof boardSchema>;

export const flowSectionSchema = observed({
  projects: z.array(flowProjectSchema),
  work_items: z.array(workItemSchema),
  board: boardSchema,
});
export type FlowSection = z.infer<typeof flowSectionSchema>;

// --- Spend ---------------------------------------------------------------------------------------

export const quotaSchema = observed({
  used: z.number().nonnegative(),
  limit: z.number().positive(),
  /** What `used` and `limit` count, e.g. `percent`, `messages` or `hours`. */
  unit: label,
  /** The next (or most recent) reset the source reported. */
  resets_at: isoDateTime,
  /** Length of one quota period; weekly unless the provider says otherwise. */
  period_days: z.int().positive().default(7),
});
export type Quota = z.infer<typeof quotaSchema>;

export const monthlyCostSchema = observed({
  /** Calendar month the amounts cover, `YYYY-MM`. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected a YYYY-MM month'),
  usd: z.number().nonnegative(),
  cop: z.number().nonnegative(),
});
export type MonthlyCost = z.infer<typeof monthlyCostSchema>;

export const providerSpendSchema = z.strictObject({
  id: label,
  label,
  quota: quotaSchema,
  monthly_cost: monthlyCostSchema,
});
export type ProviderSpend = z.infer<typeof providerSpendSchema>;

export const spendSectionSchema = observed({
  providers: z.array(providerSpendSchema),
});
export type SpendSection = z.infer<typeof spendSectionSchema>;

// --- Metrics -------------------------------------------------------------------------------------

/** The sixteen merge-priority metrics, in their canonical order. */
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
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export const metricSeriesSchema = observed({
  unit: label.optional(),
  points: z.array(z.strictObject({ at: isoDateTime, value: z.number() })).min(1),
});
export type MetricSeries = z.infer<typeof metricSeriesSchema>;

export const projectMetricsSchema = z.strictObject({
  project: label,
  /** Any subset of the sixteen; a metric that is absent reads as "no data". */
  metrics: z.partialRecord(z.enum(METRIC_NAMES), metricSeriesSchema),
});
export type ProjectMetrics = z.infer<typeof projectMetricsSchema>;

export const metricsSectionSchema = observed({
  projects: z.array(projectMetricsSchema),
});
export type MetricsSection = z.infer<typeof metricsSectionSchema>;

// --- Snapshot ------------------------------------------------------------------------------------

export const SECTION_KEYS = ['attention', 'flow', 'spend', 'metrics'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const snapshotSchema = z.strictObject({
  /** Free-text note for people reading the file; ignored by every reader. */
  $comment: z.string().optional(),
  schema_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
  /** When the snapshot was assembled. No `as_of` inside it may be later than this. */
  generated_at: isoDateTime,
  /** `true` on every committed fixture. Real snapshots omit it. */
  synthetic: z.boolean().optional(),
  attention: attentionSectionSchema,
  flow: flowSectionSchema,
  spend: spendSectionSchema,
  metrics: metricsSectionSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
/** The snapshot as written, before defaults (such as a quota's `period_days`) are applied. */
export type SnapshotInput = z.input<typeof snapshotSchema>;

export interface SectionMap {
  attention: AttentionSection;
  flow: FlowSection;
  spend: SpendSection;
  metrics: MetricsSection;
}

export const sectionSchemas = {
  attention: attentionSectionSchema,
  flow: flowSectionSchema,
  spend: spendSectionSchema,
  metrics: metricsSectionSchema,
} as const;

export { noDataSchema };

// --- Validation ----------------------------------------------------------------------------------

export interface SnapshotIssue {
  /** Dotted path to the offending value, e.g. `attention.candidates[0].url`; empty for the root. */
  path: string;
  message: string;
}

export type SnapshotParseResult =
  { ok: true; snapshot: Snapshot } | { ok: false; issues: SnapshotIssue[] };

/** Clock skew tolerated between a source's `as_of` and the snapshot's `generated_at`. */
export const AS_OF_SKEW_MS = 5 * 60 * 1000;

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === 'number') return `${out}[${key}]`;
    const name = String(key);
    return out === '' ? name : `${out}.${name}`;
  }, '');
}

/**
 * Every `as_of` anywhere inside `node` that is later than `limitMs`, by path. Used for a whole
 * snapshot (against its `generated_at`) and for one adapter report (against the collection time);
 * `limitLabel` names the limit in each message.
 */
export function asOfLaterThan(
  node: unknown,
  limitMs: number,
  limitLabel: string,
  path: PropertyKey[] = [],
): SnapshotIssue[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => asOfLaterThan(child, limitMs, limitLabel, [...path, i]));
  }
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) => {
    if (key !== 'as_of' || typeof child !== 'string') {
      return asOfLaterThan(child, limitMs, limitLabel, [...path, key]);
    }
    return Date.parse(child) > limitMs
      ? [
          {
            path: formatPath([...path, key]),
            message: `as_of ${child} is later than ${limitLabel}`,
          },
        ]
      : [];
  });
}

/**
 * Parses untrusted input (a decoded JSON value) into a {@link Snapshot}. Never throws: a bad
 * input returns `{ ok: false, issues }` naming every problem by path.
 */
export function parseSnapshot(input: unknown): SnapshotParseResult {
  if (input !== null && typeof input === 'object' && 'schema_version' in input) {
    const version = (input as { schema_version: unknown }).schema_version;
    if (version !== SNAPSHOT_SCHEMA_VERSION) {
      return {
        ok: false,
        issues: [
          {
            path: 'schema_version',
            message: `unsupported schema_version ${JSON.stringify(version)}; this reader knows ${SNAPSHOT_SCHEMA_VERSION}`,
          },
        ],
      };
    }
  }
  const result = snapshotSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }
  const limit = Date.parse(result.data.generated_at) + AS_OF_SKEW_MS;
  const future = asOfLaterThan(result.data, limit, `generated_at ${result.data.generated_at}`);
  if (future.length > 0) return { ok: false, issues: future };
  return { ok: true, snapshot: result.data };
}

export class SnapshotValidationError extends Error {
  readonly issues: SnapshotIssue[];

  constructor(issues: SnapshotIssue[], context = 'snapshot') {
    const shown = issues
      .slice(0, 5)
      .map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
      .join('; ');
    const more = issues.length > 5 ? ` (+${issues.length - 5} more)` : '';
    super(`invalid ${context}: ${shown}${more}`);
    this.name = 'SnapshotValidationError';
    this.issues = issues;
  }
}

/** Like {@link parseSnapshot}, but throws a {@link SnapshotValidationError} on bad input. */
export function assertSnapshot(input: unknown, context?: string): Snapshot {
  const result = parseSnapshot(input);
  if (!result.ok) throw new SnapshotValidationError(result.issues, context);
  return result.snapshot;
}
