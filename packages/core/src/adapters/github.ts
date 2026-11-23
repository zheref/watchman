import { z } from 'zod';
import { weekBounds } from '../flow';
import { noData } from '../provenance';
import type { AttentionCandidate, FlowProject, WorkItem } from '../snapshot';
import { HOUR_MS, toMillis } from '../time';
import { PR_WAIT_THRESHOLD_HOURS } from '../attention';
import { compileExclusions, isAlwaysExcluded, type RepoRef } from './exclusions';
import { ghJson, type GhRunner } from './gh';
import type { PartialSnapshot, SourceAdapter, SourceAdapterContext } from './source';

/**
 * The GitHub adapter. It reads, through the `gh` CLI the owner is already signed in to, the
 * repositories one **personal account** owns — never an organisation's — and reports:
 *
 * - **Flow**: open PRs and issues per repository, plus the work items Flow derives throughput
 *   (merged PRs and completed issues this week against last) and stale items (open, untouched
 *   for more than three days) from.
 * - **Attention**: open, non-draft PRs that have waited more than 48 hours, and PRs that request
 *   the owner's review. A PR's milestone due date becomes the candidate's deadline.
 *
 * Only read-only commands run (see `gh.ts`). Repositories matched by the built-in exclusions or
 * the configured exclude list are dropped from the repository list before anything else about
 * them is read.
 */

export const GITHUB_SOURCE = 'github';

/** Highest item count one list call may return before the adapter refuses as incomplete. */
export const GH_LIST_LIMIT = 1000;

export interface GitHubAdapterOptions {
  run: GhRunner;
  /** The personal account to read; the signed-in account when absent. */
  owner?: string;
  /** Names, `owner/name`s and glob patterns to leave out, on top of the built-in exclusions. */
  exclude?: readonly string[];
  includeArchived?: boolean;
  includeForks?: boolean;
  /** The owner's offset from UTC, for where "this week" starts. */
  utcOffsetMinutes?: number;
  /** Repositories read at once; 4 by default. */
  concurrency?: number;
}

const login = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'not a GitHub login');
const iso = z.string().min(1);

const userSchema = z.object({ login, type: z.string() });
const repoSchema = z.object({
  name: z.string().min(1),
  owner: z.object({ login }),
  isArchived: z.boolean(),
  isFork: z.boolean(),
  /** A repository with issues turned off answers `gh issue list` with an error, so it is not asked. */
  hasIssuesEnabled: z.boolean().default(true),
  /** A fork's upstream: excluded material must not slip in under a neutral fork name. */
  parent: z.object({ name: z.string(), owner: z.object({ login: z.string() }) }).nullish(),
});
const milestoneSchema = z.object({ dueOn: iso.nullish() }).nullish();
const reviewRequestSchema = z.object({ login: z.string().optional() });
const openPrSchema = z.object({
  number: z.int(),
  title: z.string(),
  url: z.string(),
  createdAt: iso,
  updatedAt: iso,
  isDraft: z.boolean(),
  reviewRequests: z.array(reviewRequestSchema).default([]),
  milestone: milestoneSchema,
});
const mergedPrSchema = z.object({
  number: z.int(),
  title: z.string(),
  url: z.string(),
  createdAt: iso,
  updatedAt: iso,
  mergedAt: iso.nullish(),
});
const issueSchema = z.object({
  number: z.int(),
  title: z.string(),
  url: z.string(),
  createdAt: iso,
  updatedAt: iso,
  closedAt: iso.nullish(),
  stateReason: z.string().nullish(),
});

type OpenPr = z.infer<typeof openPrSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`gh returned an unexpected shape for ${what}`);
  return result.data;
}

/** Runs `task` over `items` with at most `limit` in flight; rejects on the first failure. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${String(limit)}`);
  }
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const title = (raw: string, number: number) => (raw.trim() || `#${number}`).slice(0, 200);

/** `YYYY-MM-DD` (UTC) of an instant, for a GitHub search qualifier. */
const searchDate = (at: Date) => at.toISOString().slice(0, 10);

interface RepoReport {
  project: FlowProject;
  items: WorkItem[];
  candidates: AttentionCandidate[];
}

function listArgs(
  kind: 'pr' | 'issue',
  repo: string,
  state: string,
  fields: string,
  search?: string,
) {
  return [
    kind,
    'list',
    '--repo',
    repo,
    '--state',
    state,
    '--limit',
    String(GH_LIST_LIMIT),
    ...(search === undefined ? [] : ['--search', search]),
    '--json',
    fields,
  ];
}

/** Builds the `github` source adapter. */
export function createGitHubAdapter(options: GitHubAdapterOptions): SourceAdapter {
  const excluded = compileExclusions(options.exclude ?? []);
  const concurrency = options.concurrency ?? 4;

  async function list<T>(schema: z.ZodType<T>, args: string[], what: string): Promise<T[]> {
    const rows = parse(z.array(schema), await ghJson(options.run, args), what);
    if (rows.length >= GH_LIST_LIMIT) {
      throw new Error(`${what}: ${GH_LIST_LIMIT} or more results; counts would be incomplete`);
    }
    return rows;
  }

  async function resolveOwner(): Promise<string> {
    const owner =
      options.owner ?? parse(userSchema, await ghJson(options.run, ['api', 'user']), 'user').login;
    parse(login, owner, 'the configured owner');
    if (isAlwaysExcluded(owner)) throw new Error('the configured owner is excluded');
    const account = parse(
      userSchema,
      await ghJson(options.run, ['api', `users/${owner}`]),
      'owner',
    );
    if (account.type !== 'User') {
      throw new Error('only a personal account is read, never an organisation');
    }
    return account.login;
  }

  async function readRepo(
    repo: RepoRef & { hasIssues: boolean },
    owner: string,
    asOf: string,
    now: Date,
    since: Date,
  ): Promise<RepoReport> {
    const full = `${repo.owner}/${repo.name}`;
    const date = searchDate(since);
    const [openPrs, mergedPrs, openIssues, closedIssues] = await Promise.all([
      list(
        openPrSchema,
        listArgs(
          'pr',
          full,
          'open',
          'number,title,url,createdAt,updatedAt,isDraft,reviewRequests,milestone',
        ),
        'open pull requests',
      ),
      list(
        mergedPrSchema,
        listArgs(
          'pr',
          full,
          'merged',
          'number,title,url,createdAt,updatedAt,mergedAt',
          `merged:>=${date}`,
        ),
        'merged pull requests',
      ),
      repo.hasIssues
        ? list(
            issueSchema,
            listArgs('issue', full, 'open', 'number,title,url,createdAt,updatedAt'),
            'open issues',
          )
        : Promise.resolve([]),
      !repo.hasIssues
        ? Promise.resolve([])
        : list(
            issueSchema,
            listArgs(
              'issue',
              full,
              'closed',
              'number,title,url,createdAt,updatedAt,closedAt,stateReason',
              `closed:>=${date}`,
            ),
            'closed issues',
          ),
    ]);

    const stamp = { source: GITHUB_SOURCE, as_of: asOf };
    const keep = (row: { title: string; url: string }) =>
      !isAlwaysExcluded(row.title) && !isAlwaysExcluded(row.url);
    const item = (
      kind: 'pr' | 'issue',
      row: { number: number; title: string; url: string; createdAt: string; updatedAt: string },
      completedAt?: string | null,
    ): WorkItem => ({
      id: `${GITHUB_SOURCE}:${full}#${kind}-${row.number}`,
      project: repo.name,
      kind,
      title: title(row.title, row.number),
      url: row.url,
      opened_at: row.createdAt,
      updated_at: row.updatedAt,
      ...(completedAt ? { completed_at: completedAt } : {}),
      ...stamp,
    });

    const items: WorkItem[] = [
      ...openPrs.filter(keep).map((pr) => item('pr', pr)),
      ...mergedPrs.filter((pr) => keep(pr) && pr.mergedAt).map((pr) => item('pr', pr, pr.mergedAt)),
      ...openIssues.filter(keep).map((issue) => item('issue', issue)),
      ...closedIssues
        // Closed as "not planned" or a duplicate is not finished work.
        .filter(
          (issue) =>
            keep(issue) &&
            issue.closedAt &&
            issue.stateReason !== 'NOT_PLANNED' &&
            issue.stateReason !== 'DUPLICATE',
        )
        .map((issue) => item('issue', issue, issue.closedAt)),
    ];

    const candidates = openPrs
      .filter(keep)
      .map((pr) => candidateFor(pr, full, repo.name, owner, now, asOf))
      .filter((c): c is AttentionCandidate => c !== null);

    return {
      project: {
        project: repo.name,
        // Counted after the exclusion, so a count never includes an item the snapshot dropped.
        open_prs: openPrs.filter(keep).length,
        open_issues: openIssues.filter(keep).length,
        ...stamp,
      },
      items,
      candidates,
    };
  }

  return {
    id: GITHUB_SOURCE,
    feeds: ['attention', 'flow'],
    async fetch(context: SourceAdapterContext): Promise<PartialSnapshot> {
      const now = context.now;
      const asOf = now.toISOString();
      const owner = await resolveOwner();
      const repos = parse(
        z.array(repoSchema),
        await ghJson(options.run, [
          'repo',
          'list',
          owner,
          '--limit',
          String(GH_LIST_LIMIT),
          '--json',
          'name,owner,isArchived,isFork,hasIssuesEnabled,parent',
        ]),
        'repositories',
      )
        .filter((r) => r.owner.login.toLowerCase() === owner.toLowerCase())
        .filter((r) => options.includeArchived === true || !r.isArchived)
        .filter((r) => options.includeForks === true || !r.isFork)
        .filter(
          (r) =>
            !r.parent ||
            (!isAlwaysExcluded(r.parent.owner.login) && !isAlwaysExcluded(r.parent.name)),
        )
        .map((r) => ({ owner: r.owner.login, name: r.name, hasIssues: r.hasIssuesEnabled }))
        .filter((r) => !excluded(r));

      const { last_week_start } = weekBounds(now, { utcOffsetMinutes: options.utcOffsetMinutes });
      const reports = await mapPool(repos, concurrency, (repo) => {
        if (context.signal?.aborted) return Promise.reject(new Error('aborted'));
        return readRepo(repo, owner, asOf, now, last_week_start);
      });

      const stamp = { source: GITHUB_SOURCE, as_of: asOf };
      return {
        source: GITHUB_SOURCE,
        as_of: asOf,
        sections: {
          attention: {
            state: 'value',
            ...stamp,
            candidates: reports.flatMap((r) => r.candidates),
          },
          flow: {
            state: 'value',
            ...stamp,
            projects: reports.map((r) => r.project),
            work_items: reports.flatMap((r) => r.items),
            board: noData('the board comes from the handoff board export', GITHUB_SOURCE, asOf),
          },
        },
      };
    },
  };
}

/**
 * The Attention candidate for one open PR, or `null` when it is not waiting on the owner yet:
 * a PR that requests the owner's review is an owner decision (value 4); any other open,
 * non-draft PR becomes a waiting PR (value 3) once it has been open more than 48 hours. A
 * milestone due date becomes the deadline and adds one to the value.
 */
export function candidateFor(
  pr: OpenPr,
  full: string,
  project: string,
  owner: string,
  now: Date,
  asOf: string,
): AttentionCandidate | null {
  const asksOwner = pr.reviewRequests.some((r) => r.login?.toLowerCase() === owner.toLowerCase());
  const waitedMs = now.getTime() - toMillis(pr.createdAt);
  const waiting = !pr.isDraft && waitedMs > PR_WAIT_THRESHOLD_HOURS * HOUR_MS;
  if (!asksOwner && !waiting) return null;
  const due = pr.milestone?.dueOn ?? undefined;
  const base = asksOwner ? 4 : 3;
  return {
    id: `${GITHUB_SOURCE}:${full}#pr-${pr.number}`,
    kind: asksOwner ? 'owner_decision' : 'waiting_pr',
    title: title(pr.title, pr.number),
    project,
    url: pr.url,
    value: Math.min(5, base + (due ? 1 : 0)),
    waiting_since: pr.createdAt,
    ...(due ? { due_at: due } : {}),
    source: GITHUB_SOURCE,
    as_of: asOf,
  };
}
