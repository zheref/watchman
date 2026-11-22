import { z } from 'zod';
import { deepLink, isoDateTime, noData } from '../provenance';
import type { AttentionCandidate, ProviderSpend, WorkItem } from '../snapshot';
import { SnapshotSourceError } from './file';
import type { PartialSnapshot, SourceAdapter, SourceAdapterContext } from './source';

/**
 * Manual-export adapters: the sources Watchman cannot reach without a token it does not hold
 * (the handoff board, the AI-services and cloud-runs trackers, the AI-surfaces spend sheet). The
 * owner exports each one as a small JSON file into the snapshot directory; the adapter validates
 * it and reports its figures marked `manual`. A missing file is not an error: the adapter reports
 * the sections it would have fed as `no_data`, naming the file it looked for.
 *
 * These adapters never call the services themselves. The schemas are documented in the README
 * and a synthetic example of each lives in `fixtures/synthetic/exports/`.
 */

/** The file each export is read from, inside the snapshot directory. */
export const EXPORT_FILES = {
  'handoff-board': 'handoff-board.json',
  'ai-services': 'ai-services.json',
  'cloud-runs': 'cloud-runs.json',
  'ai-surfaces-spend': 'ai-surfaces-spend.json',
} as const;
export type ExportKind = keyof typeof EXPORT_FILES;

/** The version of the export formats below; a file with another version is refused. */
export const EXPORT_VERSION = 1;

const label = z.string().trim().min(1);

const header = <K extends ExportKind>(kind: K) => ({
  $comment: z.string().optional(),
  synthetic: z.boolean().optional(),
  export: z.literal(kind),
  version: z.literal(EXPORT_VERSION),
  /** When the export was taken from the source. */
  as_of: isoDateTime,
  /** Overrides the default source label (`manual:<file>`). */
  source: label.optional(),
});

/** One entry the owner may need to act on, common to the board and the trackers. */
const entryShape = {
  id: label,
  title: label.max(200),
  project: label,
  url: deepLink,
  opened_at: isoDateTime,
  updated_at: isoDateTime,
  /** Set once the entry is done. */
  completed_at: isoDateTime.optional(),
  /** Waiting on something outside the owner's hands. */
  blocked: z.boolean().optional(),
  /** Waiting on the owner's yes. */
  needs_owner: z.boolean().optional(),
  /** 1 (low) to 5 (high); 3 when absent. */
  value: z.int().min(1).max(5).optional(),
  /** Since when it has waited; `updated_at` when absent. */
  waiting_since: isoDateTime.optional(),
  due_at: isoDateTime.optional(),
};

export const handoffBoardExportSchema = z.strictObject({
  ...header('handoff-board'),
  /** Column order for the board; columns seen only on cards follow in first-seen order. */
  columns: z.array(label).optional(),
  cards: z.array(z.strictObject({ ...entryShape, column: label })),
});
export type HandoffBoardExport = z.infer<typeof handoffBoardExportSchema>;

const trackerSchema = <K extends 'ai-services' | 'cloud-runs'>(kind: K) =>
  z.strictObject({
    ...header(kind),
    items: z.array(z.strictObject({ ...entryShape, status: label })),
  });
export const aiServicesExportSchema = trackerSchema('ai-services');
export const cloudRunsExportSchema = trackerSchema('cloud-runs');
export type TrackerExport = z.infer<typeof aiServicesExportSchema>;

const amountsAsOf = { as_of: isoDateTime.optional() };
export const aiSurfacesSpendExportSchema = z.strictObject({
  ...header('ai-surfaces-spend'),
  providers: z.array(
    z.strictObject({
      id: label,
      label,
      /** Absent when the sheet has no reading; say why in `quota_missing`. */
      quota: z
        .strictObject({
          used: z.number().nonnegative(),
          limit: z.number().positive(),
          unit: label,
          resets_at: isoDateTime,
          period_days: z.int().positive().optional(),
          ...amountsAsOf,
        })
        .optional(),
      quota_missing: label.optional(),
      monthly_cost: z
        .strictObject({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected a YYYY-MM month'),
          usd: z.number().nonnegative(),
          cop: z.number().nonnegative(),
          ...amountsAsOf,
        })
        .optional(),
      cost_missing: label.optional(),
    }),
  ),
});
export type AiSurfacesSpendExport = z.infer<typeof aiSurfacesSpendExportSchema>;

export interface ExportAdapterOptions {
  /** The snapshot directory. */
  dir: string;
  /** Reads a UTF-8 file; rejects with `code: 'ENOENT'` when it does not exist (Node's readFile). */
  readText: (path: string) => Promise<string>;
}

type Read<T> = { present: true; data: T; source: string } | { present: false; source: string };

async function readExport<T>(
  options: ExportAdapterOptions,
  kind: ExportKind,
  schema: z.ZodType<T>,
): Promise<Read<T>> {
  const file = EXPORT_FILES[kind];
  const fallback = `manual:${file}`;
  const dir = options.dir.trim().replace(/[\\/]+$/, '');
  if (dir === '') throw new RangeError('snapshot directory must not be empty');
  let text: string;
  try {
    text = await options.readText(`${dir}/${file}`);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'ENOENT') return { present: false, source: fallback };
    // Keep only the code: Node's message carries the absolute path.
    throw new SnapshotSourceError(
      `${fallback}: could not be read${typeof code === 'string' ? ` (${code})` : ''}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SnapshotSourceError(`${fallback}: not valid JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SnapshotSourceError(
      `${fallback}: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'invalid'}`,
    );
  }
  const declared = (parsed.data as { source?: string }).source;
  return { present: true, data: parsed.data, source: declared ?? fallback };
}

const absent = (file: string) => `${file} is not in the snapshot directory`;

type Entry = z.infer<z.ZodObject<typeof entryShape>>;

function toWorkItem(prefix: string, entry: Entry, source: string, asOf: string): WorkItem {
  return {
    id: `${prefix}:${entry.id}`,
    project: entry.project,
    kind: 'card',
    title: entry.title,
    url: entry.url,
    opened_at: entry.opened_at,
    updated_at: entry.updated_at,
    ...(entry.completed_at ? { completed_at: entry.completed_at } : {}),
    source,
    as_of: asOf,
    manual: true,
  };
}

/** A waiting entry becomes an Attention candidate: a blocked one first, then one needing the owner. */
function toCandidate(
  prefix: string,
  entry: Entry,
  source: string,
  asOf: string,
): AttentionCandidate | null {
  if (entry.completed_at !== undefined) return null;
  if (entry.blocked !== true && entry.needs_owner !== true) return null;
  return {
    id: `${prefix}:${entry.id}`,
    kind: entry.blocked === true ? 'blocked_card' : 'owner_decision',
    title: entry.title,
    project: entry.project,
    url: entry.url,
    value: entry.value ?? 3,
    waiting_since: entry.waiting_since ?? entry.updated_at,
    ...(entry.due_at ? { due_at: entry.due_at } : {}),
    source,
    as_of: asOf,
    manual: true,
  };
}

function boardColumns(data: HandoffBoardExport): { name: string; count: number }[] {
  const order = [...(data.columns ?? [])];
  for (const card of data.cards) if (!order.includes(card.column)) order.push(card.column);
  return order.map((name) => ({
    name,
    count: data.cards.filter((card) => card.column === name).length,
  }));
}

/** The handoff board: Flow's board and card work items, and Attention's blocked cards. */
export function createHandoffBoardAdapter(options: ExportAdapterOptions): SourceAdapter {
  return {
    id: 'handoff-board',
    async fetch(context: SourceAdapterContext): Promise<PartialSnapshot> {
      const read = await readExport(options, 'handoff-board', handoffBoardExportSchema);
      const now = context.now.toISOString();
      if (!read.present) {
        const reason = absent(EXPORT_FILES['handoff-board']);
        return {
          source: read.source,
          as_of: now,
          sections: {
            attention: noData(reason, read.source, now),
            flow: noData(reason, read.source, now),
          },
        };
      }
      const { data, source } = read;
      const stamp = { source, as_of: data.as_of, manual: true };
      return {
        source,
        as_of: data.as_of,
        ...(data.synthetic === true ? { synthetic: true } : {}),
        sections: {
          attention: {
            state: 'value',
            ...stamp,
            candidates: data.cards
              .map((card) => toCandidate('handoff', card, source, data.as_of))
              .filter((c): c is AttentionCandidate => c !== null),
          },
          flow: {
            state: 'value',
            ...stamp,
            projects: [],
            work_items: data.cards.map((card) => toWorkItem('handoff', card, source, data.as_of)),
            board: { state: 'value', ...stamp, columns: boardColumns(data) },
          },
        },
      };
    },
  };
}

/** A tracker (AI services, cloud runs): Flow work items and Attention candidates. */
export function createTrackerAdapter(
  kind: 'ai-services' | 'cloud-runs',
  options: ExportAdapterOptions,
): SourceAdapter {
  const schema = kind === 'ai-services' ? aiServicesExportSchema : cloudRunsExportSchema;
  return {
    id: kind,
    async fetch(context: SourceAdapterContext): Promise<PartialSnapshot> {
      const read = await readExport(options, kind, schema as z.ZodType<TrackerExport>);
      const now = context.now.toISOString();
      if (!read.present) {
        const reason = absent(EXPORT_FILES[kind]);
        return {
          source: read.source,
          as_of: now,
          sections: {
            attention: noData(reason, read.source, now),
            flow: noData(reason, read.source, now),
          },
        };
      }
      const { data, source } = read;
      const stamp = { source, as_of: data.as_of, manual: true };
      return {
        source,
        as_of: data.as_of,
        ...(data.synthetic === true ? { synthetic: true } : {}),
        sections: {
          attention: {
            state: 'value',
            ...stamp,
            candidates: data.items
              .map((item) => toCandidate(kind, item, source, data.as_of))
              .filter((c): c is AttentionCandidate => c !== null),
          },
          flow: {
            state: 'value',
            ...stamp,
            projects: [],
            work_items: data.items.map((item) => toWorkItem(kind, item, source, data.as_of)),
            board: noData('the board comes from the handoff board export', source, data.as_of),
          },
        },
      };
    },
  };
}

/** The AI-surfaces spend sheet: Spend, every figure manual. */
export function createAiSurfacesSpendAdapter(options: ExportAdapterOptions): SourceAdapter {
  return {
    id: 'ai-surfaces-spend',
    async fetch(context: SourceAdapterContext): Promise<PartialSnapshot> {
      const read = await readExport(options, 'ai-surfaces-spend', aiSurfacesSpendExportSchema);
      const now = context.now.toISOString();
      if (!read.present) {
        return {
          source: read.source,
          as_of: now,
          sections: {
            spend: noData(absent(EXPORT_FILES['ai-surfaces-spend']), read.source, now),
          },
        };
      }
      const { data, source } = read;
      const providers: ProviderSpend[] = data.providers.map((p) => ({
        id: p.id,
        label: p.label,
        quota: p.quota
          ? {
              state: 'value',
              used: p.quota.used,
              limit: p.quota.limit,
              unit: p.quota.unit,
              resets_at: p.quota.resets_at,
              period_days: p.quota.period_days ?? 7,
              source,
              as_of: p.quota.as_of ?? data.as_of,
              manual: true,
            }
          : noData(p.quota_missing ?? 'no quota reading in the spend sheet', source, data.as_of),
        monthly_cost: p.monthly_cost
          ? {
              state: 'value',
              month: p.monthly_cost.month,
              usd: p.monthly_cost.usd,
              cop: p.monthly_cost.cop,
              source,
              as_of: p.monthly_cost.as_of ?? data.as_of,
              manual: true,
            }
          : noData(p.cost_missing ?? 'no cost reading in the spend sheet', source, data.as_of),
      }));
      return {
        source,
        as_of: data.as_of,
        ...(data.synthetic === true ? { synthetic: true } : {}),
        sections: {
          spend: { state: 'value', source, as_of: data.as_of, manual: true, providers },
        },
      };
    },
  };
}

/** Metrics have no source yet: this reports the section as `no_data`, never a placeholder value. */
export function createScorecardPlaceholderAdapter(): SourceAdapter {
  return {
    id: 'scorecard',
    fetch(context: SourceAdapterContext): Promise<PartialSnapshot> {
      const now = context.now.toISOString();
      return Promise.resolve({
        source: 'scorecard',
        as_of: now,
        sections: { metrics: noData('no scorecard source exists yet', 'scorecard', now) },
      });
    },
  };
}
