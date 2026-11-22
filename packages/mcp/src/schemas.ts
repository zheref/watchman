import { z } from 'zod';
import {
  ATTENTION_KINDS,
  MAX_WINDOW_DAYS,
  METRIC_NAMES,
  WINDOW_PATTERN,
  WORK_ITEM_KINDS,
  isoDateTime,
  noDataSchema,
  parseWindow,
} from '@watchman/core';

/**
 * The input and output schemas of the four tools. They are what the server advertises in
 * `tools/list` (the SDK converts them to JSON Schema) and what it validates every call and every
 * result against, so CONTRACT.md, which is generated from that advertisement, cannot drift.
 *
 * Every output is an object whose top level carries `source` and `as_of`; a section that could not
 * be observed is the core `no_data` record (`state`, `reason`, `source`, `as_of`), never zeros.
 */

// --- Inputs --------------------------------------------------------------------------------------

const project = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe('Only this project (case-insensitive exact name, e.g. "Project Alpha").');

const since = isoDateTime.describe(
  'Only what happened at or after this ISO 8601 date-time with an offset, e.g. 2026-01-10T00:00:00Z.',
);

const window = z
  .string()
  .regex(WINDOW_PATTERN, 'expected a window such as 48h, 7d or 2w')
  .refine(
    (value) => {
      try {
        parseWindow(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: `a window is at most ${MAX_WINDOW_DAYS}d` },
  )
  .describe(
    `Only what happened within this window back from now: <n>h, <n>d or <n>w, at most ${MAX_WINDOW_DAYS}d. With since too, the later bound wins.`,
  );

const filterShape = {
  project: project.optional(),
  since: since.optional(),
  window: window.optional(),
};

export const filterInputSchema = z.strictObject(filterShape);
export type FilterInput = z.infer<typeof filterInputSchema>;

/** The largest `limit` get_attention accepts. */
export const ATTENTION_MAX_LIMIT = 50;

export const attentionInputSchema = z.strictObject({
  ...filterShape,
  limit: z
    .int()
    .min(1)
    .max(ATTENTION_MAX_LIMIT)
    .optional()
    .describe(`How many ranked items to return, 1 to ${ATTENTION_MAX_LIMIT}; 5 by default.`),
});
export type AttentionInput = z.infer<typeof attentionInputSchema>;

// --- Shared output pieces ------------------------------------------------------------------------

const text = z.string().min(1);
const count = z.int().nonnegative();
const manual = z
  .boolean()
  .optional()
  .describe(
    'Present and true when a person typed the figures in rather than a source reporting them.',
  );

const provenance = {
  source: text.describe('Where the figures came from.'),
  as_of: isoDateTime.describe('When the figures were true at the source.'),
  manual,
};

const noData = noDataSchema;

/** The envelope every response carries around its one section. */
const envelope = {
  source: text.describe('Source of the section this response reports.'),
  as_of: isoDateTime.describe('When that section was true at its source.'),
  synthetic: z
    .boolean()
    .describe('True when the data is synthetic (the committed fixture, or a snapshot marked so).'),
  evaluated_at: isoDateTime.describe('The instant rankings, ages and countdowns were computed at.'),
  snapshot: z
    .strictObject({
      origin: z
        .enum(['file', 'synthetic-fixture', 'unavailable'])
        .describe(
          'file: the newest snapshot in WATCHMAN_SNAPSHOT_DIR; synthetic-fixture: the variable is unset; unavailable: the directory could not be read.',
        ),
      file: text.describe('The snapshot file read (a name, never a path).'),
      generated_at: isoDateTime,
      skipped: z
        .array(z.strictObject({ source: text, problem: text }))
        .optional()
        .describe('Newer snapshot files passed over because they could not be used.'),
    })
    .describe('Which snapshot answered.'),
  filter: z
    .strictObject({ project: text.optional(), since: isoDateTime.optional() })
    .describe('The filter applied: the project as given and the effective lower time bound.'),
  gaps: z
    .array(
      z.strictObject({
        adapter: text,
        status: z.enum(['no_data', 'failed']),
        reason: text.optional(),
      }),
    )
    .optional()
    .describe(
      'Sources that feed this section but failed or had no data: the section may be partial.',
    ),
};

// --- get_attention -------------------------------------------------------------------------------

export const attentionItemSchema = z.strictObject({
  id: text,
  kind: z.enum(ATTENTION_KINDS),
  title: text,
  project: text,
  url: text.describe('Where the owner revises, halts or unblocks it.'),
  value: z.int().min(1).max(5),
  urgency: z.int().min(1).max(5),
  score: z.int().min(1).max(25).describe('value × urgency; the list is ordered by it.'),
  waited_hours: count,
  waiting_since: isoDateTime,
  due_at: isoDateTime.optional(),
  ...provenance,
});

export const attentionOutputSchema = z.strictObject({
  ...envelope,
  attention: z.discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('value'),
      ...provenance,
      total: count.describe('Eligible items after the filter; items holds the top `limit`.'),
      not_yet_due: count.describe(
        'Pull requests matching the filter that have not waited 48h yet.',
      ),
      items: z.array(attentionItemSchema),
    }),
    noData,
  ]),
});
export type AttentionOutput = z.infer<typeof attentionOutputSchema>;

// --- get_flow ------------------------------------------------------------------------------------

const boardOutput = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('value'),
    ...provenance,
    columns: z.array(z.strictObject({ name: text, count })),
  }),
  noData,
]);

export const flowOutputSchema = z.strictObject({
  ...envelope,
  flow: z.discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('value'),
      ...provenance,
      totals: z.strictObject({ open_prs: count, open_issues: count, projects: count }),
      projects: z.array(
        z.strictObject({ project: text, open_prs: count, open_issues: count, ...provenance }),
      ),
      throughput: z
        .strictObject({
          this_week: count,
          last_week: count,
          delta: z.int(),
          trend: z.enum(['up', 'down', 'flat']),
        })
        .describe('Items completed this week against last week; weeks start Monday, owner time.'),
      window: z
        .strictObject({ since: isoDateTime, opened: count, completed: count })
        .optional()
        .describe('With a time filter: work items opened and completed at or after since.'),
      stale: z
        .array(
          z.strictObject({
            id: text,
            project: text,
            kind: z.enum(WORK_ITEM_KINDS),
            title: text,
            url: text,
            idle_days: count,
            updated_at: isoDateTime,
            ...provenance,
          }),
        )
        .describe('Open items not updated for more than 3 days, most idle first.'),
      board: boardOutput.describe('Handoff board cards by state; not broken down by project.'),
    }),
    noData,
  ]),
});
export type FlowOutput = z.infer<typeof flowOutputSchema>;

// --- get_spend -----------------------------------------------------------------------------------

const quotaOutput = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('value'),
    used: z.number().nonnegative(),
    limit: z.number().positive(),
    unit: text,
    percent: z.int().nonnegative(),
    remaining: z.number().nonnegative(),
    exceeded: z.boolean(),
    resets_at: isoDateTime.describe('The next reset after evaluated_at.'),
    resets_in: text.describe('Countdown to that reset, e.g. 4d 9h.'),
    ...provenance,
  }),
  noData,
]);

const costOutput = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('value'),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    usd: z.number().nonnegative(),
    cop: z.number().nonnegative(),
    ...provenance,
  }),
  noData,
]);

export const spendOutputSchema = z.strictObject({
  ...envelope,
  spend: z.discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('value'),
      ...provenance,
      month: z.string().describe('The current month in owner time, YYYY-MM.'),
      total: z
        .discriminatedUnion('state', [
          z.strictObject({
            state: z.literal('value'),
            month: z.string(),
            usd: z.number().nonnegative(),
            cop: z.number().nonnegative(),
            included: z.array(text),
            missing: z.array(text).describe('Providers with no cost reading for the month.'),
            partial: z.boolean(),
            manual: z.boolean(),
            source: text,
            as_of: isoDateTime,
          }),
          noData,
        ])
        .describe("The month's cost over every provider that reported one."),
      providers: z.array(
        z.strictObject({ id: text, label: text, quota: quotaOutput, monthly_cost: costOutput }),
      ),
    }),
    noData,
  ]),
});
export type SpendOutput = z.infer<typeof spendOutputSchema>;

// --- get_metrics ---------------------------------------------------------------------------------

const metricCellOutput = z.discriminatedUnion('state', [
  z.strictObject({
    name: z.enum(METRIC_NAMES),
    state: z.literal('value'),
    unit: text.optional(),
    latest: z.number(),
    previous: z.number().nullable(),
    delta: z.number().nullable(),
    latest_at: isoDateTime,
    points: z.array(z.strictObject({ at: isoDateTime, value: z.number() })).min(1),
    ...provenance,
  }),
  z.strictObject({
    name: z.enum(METRIC_NAMES),
    state: z.literal('no_data'),
    reason: text,
    source: text,
    as_of: isoDateTime,
  }),
]);

export const metricsOutputSchema = z.strictObject({
  ...envelope,
  metrics: z.discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('value'),
      ...provenance,
      projects: z.array(
        z.strictObject({
          project: text,
          metrics: z
            .array(metricCellOutput)
            .length(METRIC_NAMES.length)
            .describe('All sixteen metrics in canonical order; one not reported is no_data.'),
        }),
      ),
    }),
    noData,
  ]),
});
export type MetricsOutput = z.infer<typeof metricsOutputSchema>;
