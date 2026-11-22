import { noData, type NoData } from '../provenance';
import {
  SECTION_KEYS,
  SNAPSHOT_SCHEMA_VERSION,
  assertSnapshot,
  type Board,
  type SectionKey,
  type SectionMap,
  type Snapshot,
} from '../snapshot';
import { toMillis } from '../time';

/**
 * Source adapters: one per place Watchman reads from (GitHub, a handoff board, a tracker, a file;
 * later analytics and a scorecard). Each reports the sections it knows; {@link collectSnapshot}
 * merges their reports into one validated {@link Snapshot}, and a section no adapter reported
 * becomes an explicit `no_data` section rather than an empty one.
 *
 * Adapters run server-side only: they may hold tokens and read local files, so neither they nor
 * their configuration are ever imported into client code.
 */

export interface SourceAdapterContext {
  /** The instant the collection runs at; adapters stamp nothing later than this. */
  now: Date;
  /**
   * Cancellation, structurally typed so core needs no DOM or Node types: pass an `AbortSignal`.
   */
  signal?: { readonly aborted: boolean };
}

/** What one adapter reports: any subset of the four sections, with its own provenance. */
export interface PartialSnapshot {
  /** The adapter's source label, e.g. `github` or `file:snapshot.json`. */
  source: string;
  /** When the report was true at the source. */
  as_of: string;
  /** `true` when every figure in the report is synthetic (fixtures). */
  synthetic?: boolean;
  sections: Partial<SectionMap>;
}

export interface SourceAdapter {
  /** Stable, unique id, e.g. `github`, `handoff-board`, `file`. */
  readonly id: string;
  fetch(context: SourceAdapterContext): Promise<PartialSnapshot>;
}

export interface AdapterFailure {
  adapter: string;
  message: string;
}

export interface CollectedSnapshot {
  snapshot: Snapshot;
  /** Adapters that threw or rejected; their sections fall back to `no_data`. */
  failures: AdapterFailure[];
}

type ValueOf<K extends SectionKey> = Extract<SectionMap[K], { state: 'value' }>;

function provenanceOf(values: readonly { source: string; as_of: string; manual?: boolean }[]) {
  const sources = [...new Set(values.map((v) => v.source))].sort();
  const oldest = values.reduce(
    (min, v) => (toMillis(v.as_of) < toMillis(min) ? v.as_of : min),
    values[0]!.as_of,
  );
  const manual = values.some((v) => v.manual === true);
  return { source: sources.join(' + '), as_of: oldest, ...(manual ? { manual: true } : {}) };
}

function firstBoard(values: readonly ValueOf<'flow'>[]): Board {
  return values.find((v) => v.board.state === 'value')?.board ?? values[0]!.board;
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Merges several reports of the same section. Lists are concatenated (first report wins on a
 * duplicate id); the merged section's source names every contributor and its `as_of` is the
 * oldest of theirs, so the stamp never claims fresher data than the stalest part.
 */
export function mergeSection<K extends SectionKey>(
  key: K,
  reports: readonly SectionMap[K][],
): SectionMap[K] | undefined {
  if (reports.length === 0) return undefined;
  const values = reports.filter((r): r is ValueOf<K> => r.state === 'value');
  if (values.length === 0) return reports[0];
  if (values.length === 1) return values[0];
  const provenance = provenanceOf(values);
  switch (key) {
    case 'attention': {
      const v = values as unknown as ValueOf<'attention'>[];
      return {
        state: 'value',
        ...provenance,
        candidates: dedupeBy(
          v.flatMap((s) => s.candidates),
          (c) => c.id,
        ),
      } as SectionMap[K];
    }
    case 'flow': {
      const v = values as unknown as ValueOf<'flow'>[];
      return {
        state: 'value',
        ...provenance,
        projects: dedupeBy(
          v.flatMap((s) => s.projects),
          (p) => p.project,
        ),
        work_items: dedupeBy(
          v.flatMap((s) => s.work_items),
          (w) => w.id,
        ),
        board: firstBoard(v),
      } as SectionMap[K];
    }
    case 'spend': {
      const v = values as unknown as ValueOf<'spend'>[];
      return {
        state: 'value',
        ...provenance,
        providers: dedupeBy(
          v.flatMap((s) => s.providers),
          (p) => p.id,
        ),
      } as SectionMap[K];
    }
    default: {
      const v = values as unknown as ValueOf<'metrics'>[];
      return {
        state: 'value',
        ...provenance,
        projects: dedupeBy(
          v.flatMap((s) => s.projects),
          (p) => p.project,
        ),
      } as SectionMap[K];
    }
  }
}

/** The label a collected snapshot uses for sections nobody reported. */
export const COLLECTOR_SOURCE = 'watchman';

/**
 * Runs every adapter at `context.now`, merges their reports and validates the result. One
 * adapter failing never sinks the others: it is listed in `failures` and its sections fall
 * back to `no_data`.
 */
export async function collectSnapshot(
  adapters: readonly SourceAdapter[],
  context: SourceAdapterContext,
): Promise<CollectedSnapshot> {
  const ids = adapters.map((a) => a.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) throw new Error(`duplicate source adapter id: ${duplicate}`);

  const settled = await Promise.allSettled(adapters.map((a) => a.fetch(context)));
  const reports: PartialSnapshot[] = [];
  const failures: AdapterFailure[] = [];
  settled.forEach((result, index) => {
    const adapter = adapters[index]!.id;
    if (result.status === 'fulfilled') reports.push(result.value);
    else {
      const reason: unknown = result.reason;
      failures.push({
        adapter,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  const generatedAt = context.now.toISOString();
  const missingReason = (key: SectionKey): NoData =>
    noData(
      failures.length > 0
        ? `no source reported ${key} (failed: ${failures.map((f) => f.adapter).join(', ')})`
        : `no source reported ${key}`,
      COLLECTOR_SOURCE,
      generatedAt,
    );

  const sections = Object.fromEntries(
    SECTION_KEYS.map((key) => {
      const parts = reports
        .map((r) => r.sections[key])
        .filter((s): s is NonNullable<typeof s> => s !== undefined);
      return [key, mergeSection(key, parts as SectionMap[typeof key][]) ?? missingReason(key)];
    }),
  ) as unknown as SectionMap;

  const synthetic = reports.length > 0 && reports.every((r) => r.synthetic === true);
  const snapshot = assertSnapshot(
    {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      generated_at: generatedAt,
      ...(synthetic ? { synthetic: true } : {}),
      ...sections,
    },
    'collected snapshot',
  );
  return { snapshot, failures };
}
