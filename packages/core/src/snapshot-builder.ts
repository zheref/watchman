import { z } from 'zod';
import { SnapshotSourceError } from './adapters/file';
import {
  createAiSurfacesSpendAdapter,
  createHandoffBoardAdapter,
  createScorecardPlaceholderAdapter,
  createTrackerAdapter,
  type ExportAdapterOptions,
} from './adapters/exports';
import type { GhRunner } from './adapters/gh';
import { createGitHubAdapter } from './adapters/github';
import {
  collectSnapshot,
  type AdapterFailure,
  type PartialSnapshot,
  type SourceAdapter,
} from './adapters/source';
import { SECTION_KEYS, type SectionKey, type Snapshot } from './snapshot';

/**
 * Builds a real snapshot from every configured source. Pure orchestration: the caller (the
 * `npm run snapshot` script) injects file reading and the `gh` runner, so this module stays free
 * of platform APIs and every test runs against fakes.
 */

/** The optional config file, read from the snapshot directory (never committed). */
export const CONFIG_FILE = 'watchman.config.json';

export const snapshotConfigSchema = z.strictObject({
  $comment: z.string().optional(),
  github: z
    .strictObject({
      /** Set to false to skip GitHub entirely. */
      enabled: z.boolean().optional(),
      /** The personal account to read; the signed-in `gh` account when absent. */
      owner: z.string().trim().min(1).optional(),
      /** Repository names, `owner/name`s or glob patterns to leave out. */
      exclude: z.array(z.string()).optional(),
      includeArchived: z.boolean().optional(),
      includeForks: z.boolean().optional(),
    })
    .optional(),
  /** The owner's offset from UTC in minutes, for where weeks start. */
  utcOffsetMinutes: z
    .int()
    .min(-14 * 60)
    .max(14 * 60)
    .optional(),
});
export type SnapshotConfig = z.infer<typeof snapshotConfigSchema>;

export interface BuildSnapshotOptions extends ExportAdapterOptions {
  /** Runs `gh`; omit to skip GitHub. */
  runGh?: GhRunner;
  now: Date;
}

/** Reads and validates the config file; absent means every default. */
export async function readSnapshotConfig(options: ExportAdapterOptions): Promise<SnapshotConfig> {
  const dir = options.dir.trim().replace(/[\\/]+$/, '');
  let text: string;
  try {
    text = await options.readText(`${dir}/${CONFIG_FILE}`);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'ENOENT') return {};
    throw new SnapshotSourceError(
      `${CONFIG_FILE}: could not be read${typeof code === 'string' ? ` (${code})` : ''}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SnapshotSourceError(`${CONFIG_FILE}: not valid JSON`);
  }
  const parsed = snapshotConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SnapshotSourceError(
      `${CONFIG_FILE}: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'invalid'}`,
    );
  }
  return parsed.data;
}

/** The adapters a snapshot is built from, in merge order. */
export function snapshotAdapters(
  config: SnapshotConfig,
  options: ExportAdapterOptions & { runGh?: GhRunner },
): SourceAdapter[] {
  const adapters: SourceAdapter[] = [];
  if (options.runGh !== undefined && config.github?.enabled !== false) {
    adapters.push(
      createGitHubAdapter({
        run: options.runGh,
        ...(config.github?.owner === undefined ? {} : { owner: config.github.owner }),
        exclude: config.github?.exclude ?? [],
        includeArchived: config.github?.includeArchived ?? false,
        includeForks: config.github?.includeForks ?? false,
        ...(config.utcOffsetMinutes === undefined
          ? {}
          : { utcOffsetMinutes: config.utcOffsetMinutes }),
      }),
    );
  }
  const io = { dir: options.dir, readText: options.readText };
  adapters.push(
    createHandoffBoardAdapter(io),
    createTrackerAdapter('ai-services', io),
    createTrackerAdapter('cloud-runs', io),
    createAiSurfacesSpendAdapter(io),
    createScorecardPlaceholderAdapter(),
  );
  return adapters;
}

/** What one source contributed, for the run summary. */
export interface SourceStatus {
  adapter: string;
  /** `failed` when it threw or reported something invalid. */
  status: 'value' | 'no_data' | 'failed';
  /** Sections it reported with a value. */
  sections: SectionKey[];
  /** Why it has no data, or why it failed. */
  reason?: string;
}

export interface BuiltSnapshot {
  snapshot: Snapshot;
  failures: AdapterFailure[];
  sources: SourceStatus[];
}

function statusOf(adapter: string, report: PartialSnapshot): SourceStatus {
  const sections = SECTION_KEYS.filter((key) => report.sections[key]?.state === 'value');
  if (sections.length > 0) return { adapter, status: 'value', sections };
  const reason = SECTION_KEYS.map((key) => report.sections[key])
    .map((s) => (s?.state === 'no_data' ? s.reason : undefined))
    .find((r) => r !== undefined);
  return { adapter, status: 'no_data', sections: [], ...(reason ? { reason } : {}) };
}

/** Reads the config, runs every source and merges them into one validated snapshot. */
export async function buildSnapshot(options: BuildSnapshotOptions): Promise<BuiltSnapshot> {
  const config = await readSnapshotConfig(options);
  const reports = new Map<string, PartialSnapshot>();
  const adapters = snapshotAdapters(config, options).map((adapter): SourceAdapter => ({
    id: adapter.id,
    async fetch(context) {
      const report = await adapter.fetch(context);
      reports.set(adapter.id, report);
      return report;
    },
  }));
  const { snapshot, failures } = await collectSnapshot(adapters, { now: options.now });
  const sources = adapters.map((adapter): SourceStatus => {
    const failure = failures.find((f) => f.adapter === adapter.id);
    if (failure)
      return { adapter: adapter.id, status: 'failed', sections: [], reason: failure.message };
    return statusOf(adapter.id, reports.get(adapter.id)!);
  });
  return { snapshot, failures, sources };
}

/** `snapshot-2026-11-22T19-07-28Z.json`: the ISO instant, with `:` and milliseconds removed. */
export function snapshotFileName(now: Date): string {
  const iso = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return `snapshot-${iso}.json`;
}

/**
 * True when `child` is `parent` or inside it. Both must be absolute, already-normalised paths
 * (the caller resolves symlinks first); `/` and `\` are both separators.
 */
export function isInsidePath(child: string, parent: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const c = norm(child);
  const p = norm(parent);
  if (p === '/') return true;
  return c === p || c.startsWith(`${p}/`);
}

/**
 * A summary of a snapshot's **shape** only: which sections hold values, how many items each
 * list has and which sources had no data. It never prints a figure, a title, a project name or
 * a link, so it is safe to paste into a public pull request.
 */
export function describeSnapshotShape(built: BuiltSnapshot): string[] {
  const { snapshot, sources } = built;
  const lines: string[] = [];
  const state = (key: SectionKey) => snapshot[key].state;
  const a = snapshot.attention;
  lines.push(
    `attention: ${state('attention')}${a.state === 'value' ? ` (${a.candidates.length} candidates)` : ''}`,
  );
  const f = snapshot.flow;
  lines.push(
    `flow: ${state('flow')}${
      f.state === 'value'
        ? ` (${f.projects.length} projects, ${f.work_items.length} work items, board ${f.board.state})`
        : ''
    }`,
  );
  const s = snapshot.spend;
  lines.push(
    `spend: ${state('spend')}${s.state === 'value' ? ` (${s.providers.length} providers)` : ''}`,
  );
  const m = snapshot.metrics;
  lines.push(
    `metrics: ${state('metrics')}${m.state === 'value' ? ` (${m.projects.length} projects)` : ''}`,
  );
  for (const source of sources) {
    lines.push(
      `source ${source.adapter}: ${source.status}${
        source.sections.length > 0 ? ` [${source.sections.join(', ')}]` : ''
      }`,
    );
  }
  return lines;
}
