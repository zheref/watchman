import { describe, expect, it } from 'vitest';
import {
  GH_LIST_LIMIT,
  assertReadOnlyGh,
  collectSnapshot,
  createGitHubAdapter,
  mapPool,
  rankAttention,
  staleItems,
  throughput,
} from '../index';
import { NOW } from '../test/builders';
import { fakeGh, type FakeWorld } from '../test/fake-gh';

/** A synthetic world: one personal account, one organisation, and two NDA-named repositories. */
function world(): FakeWorld {
  return {
    viewer: 'sample-owner',
    accounts: { 'sample-owner': 'User', 'sample-org': 'Organization' },
    repos: [
      {
        owner: 'sample-owner',
        name: 'alpha',
        openPrs: [
          // Open four days, not a draft: waiting on the owner.
          {
            number: 1,
            title: 'Sample refactor',
            createdAt: '2026-01-10T15:00:00Z',
            updatedAt: '2026-01-10T16:00:00Z',
          },
          // Open one day: not waiting yet.
          {
            number: 2,
            title: 'Fresh sample',
            createdAt: '2026-01-13T15:00:00Z',
            updatedAt: '2026-01-14T10:00:00Z',
          },
          // A draft, open for a week: never waiting.
          {
            number: 3,
            title: 'Draft sample',
            createdAt: '2026-01-07T15:00:00Z',
            updatedAt: '2026-01-07T15:00:00Z',
            isDraft: true,
          },
          // Asks for the owner's review, with a milestone deadline.
          {
            number: 4,
            title: 'Review me',
            createdAt: '2026-01-14T09:00:00Z',
            updatedAt: '2026-01-14T09:00:00Z',
            reviewRequests: [{ login: 'Sample-Owner' }],
            milestone: { dueOn: '2026-01-16T00:00:00Z' },
          },
        ],
        mergedPrs: [
          {
            number: 9,
            title: 'Merged this week',
            createdAt: '2026-01-09T10:00:00Z',
            updatedAt: '2026-01-13T10:00:00Z',
            mergedAt: '2026-01-13T10:00:00Z',
          },
          {
            number: 8,
            title: 'Merged last week',
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-06T10:00:00Z',
            mergedAt: '2026-01-06T10:00:00Z',
          },
        ],
        openIssues: [
          {
            number: 20,
            title: 'Stale sample issue',
            createdAt: '2026-01-01T10:00:00Z',
            updatedAt: '2026-01-05T10:00:00Z',
          },
          {
            number: 21,
            title: '   ',
            createdAt: '2026-01-14T10:00:00Z',
            updatedAt: '2026-01-14T10:00:00Z',
          },
        ],
        closedIssues: [
          {
            number: 30,
            title: 'Done sample',
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-12T10:00:00Z',
            closedAt: '2026-01-12T10:00:00Z',
            stateReason: 'COMPLETED',
          },
          {
            number: 31,
            title: 'Not planned',
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-12T10:00:00Z',
            closedAt: '2026-01-12T10:00:00Z',
            stateReason: 'NOT_PLANNED',
          },
        ],
      },
      // Issues turned off: never asked for issues (GitHub would refuse the call).
      { owner: 'sample-owner', name: 'beta', hasIssues: false, openIssues: [] },
      { owner: 'sample-owner', name: 'old-archive', isArchived: true },
      { owner: 'sample-owner', name: 'someone-fork', isFork: true },
      { owner: 'sample-owner', name: 'scratch-one' },
      { owner: 'sample-owner', name: 'GlobalLogic-tools' },
      { owner: 'sample-owner', name: 'client-INSULET-app' },
      { owner: 'sample-org', name: 'org-repo' },
    ],
  };
}

const calledRepos = (calls: string[][]) => [
  ...new Set(calls.filter((c) => c.includes('--repo')).map((c) => c[c.indexOf('--repo') + 1]!)),
];

describe('createGitHubAdapter', () => {
  it('reports Flow and Attention for the owner’s own repositories', async () => {
    const gh = fakeGh(world());
    const adapter = createGitHubAdapter({ run: gh.run, exclude: ['scratch-*'] });
    const report = await adapter.fetch({ now: NOW });

    expect(adapter.id).toBe('github');
    const flow = report.sections.flow!;
    const attention = report.sections.attention!;
    if (flow.state !== 'value' || attention.state !== 'value') throw new Error('expected values');

    expect(flow.projects.map((p) => [p.project, p.open_prs, p.open_issues])).toEqual([
      ['alpha', 4, 2],
      ['beta', 0, 0],
    ]);
    expect(flow.board.state).toBe('no_data');
    expect(throughput(flow.work_items, NOW)).toMatchObject({ this_week: 2, last_week: 1 });
    expect(staleItems(flow.work_items, NOW).map((i) => i.id)).toEqual([
      'github:sample-owner/alpha#issue-20',
      'github:sample-owner/alpha#pr-3',
      'github:sample-owner/alpha#pr-1',
    ]);
    expect(flow.work_items.find((i) => i.id.endsWith('#issue-21'))?.title).toBe('#21');
    expect(flow.work_items.some((i) => i.id.endsWith('#issue-31'))).toBe(false);

    expect(attention.candidates.map((c) => [c.id, c.kind, c.value, c.due_at])).toEqual([
      ['github:sample-owner/alpha#pr-1', 'waiting_pr', 3, undefined],
      ['github:sample-owner/alpha#pr-4', 'owner_decision', 5, '2026-01-16T00:00:00Z'],
    ]);
    expect(rankAttention(attention.candidates, NOW).map((c) => c.id)[0]).toBe(
      'github:sample-owner/alpha#pr-4',
    );
  });

  it('does not ask a repository with issues turned off for issues', async () => {
    const gh = fakeGh(world());
    await createGitHubAdapter({ run: gh.run }).fetch({ now: NOW });
    const issueCalls = gh.calls.filter((c) => c[0] === 'issue');
    expect(issueCalls.some((c) => c.includes('sample-owner/beta'))).toBe(false);
    expect(issueCalls.some((c) => c.includes('sample-owner/alpha'))).toBe(true);
  });

  it('never reads an excluded, archived, forked or NDA-named repository', async () => {
    const gh = fakeGh(world());
    await createGitHubAdapter({ run: gh.run, exclude: ['scratch-*'] }).fetch({ now: NOW });
    expect(calledRepos(gh.calls).sort()).toEqual(['sample-owner/alpha', 'sample-owner/beta']);
    const all = gh.calls.flat().join(' ');
    expect(all).not.toMatch(/globallogic|insulet/i);
  });

  it('drops NDA-named repositories even when the config includes everything', async () => {
    const gh = fakeGh(world());
    const report = await createGitHubAdapter({
      run: gh.run,
      includeArchived: true,
      includeForks: true,
    }).fetch({ now: NOW });
    const flow = report.sections.flow!;
    if (flow.state !== 'value') throw new Error('expected a value');
    expect(flow.projects.map((p) => p.project)).toEqual([
      'alpha',
      'beta',
      'old-archive',
      'someone-fork',
      'scratch-one',
    ]);
  });

  it('drops items whose title or link mentions NDA material', async () => {
    const w = world();
    w.repos[0]!.openIssues!.push({
      number: 40,
      title: 'Copy notes from the Insulet project',
      createdAt: '2026-01-14T10:00:00Z',
      updatedAt: '2026-01-14T10:00:00Z',
    });
    const report = await createGitHubAdapter({ run: fakeGh(w).run }).fetch({ now: NOW });
    expect(JSON.stringify(report)).not.toMatch(/insulet/i);
  });

  it('makes only read-only gh calls', async () => {
    const gh = fakeGh(world());
    await createGitHubAdapter({ run: gh.run }).fetch({ now: NOW });
    expect(gh.calls.length).toBeGreaterThan(0);
    for (const call of gh.calls) expect(() => assertReadOnlyGh(call)).not.toThrow();
  });

  it('refuses an organisation and an NDA-named owner', async () => {
    const gh = fakeGh(world());
    await expect(
      createGitHubAdapter({ run: gh.run, owner: 'sample-org' }).fetch({ now: NOW }),
    ).rejects.toThrow('only a personal account is read, never an organisation');
    expect(gh.calls.some((c) => c[0] === 'repo')).toBe(false);
    await expect(
      createGitHubAdapter({ run: gh.run, owner: 'globallogic-team' }).fetch({ now: NOW }),
    ).rejects.toThrow('the configured owner is excluded');
    await expect(
      createGitHubAdapter({ run: gh.run, owner: 'not a login!' }).fetch({ now: NOW }),
    ).rejects.toThrow('unexpected shape');
  });

  it('keeps only repositories the owner owns', async () => {
    const w = world();
    const base = fakeGh(w).run;
    // A repo list that (wrongly) mixes in an organisation's repository is filtered anyway.
    const run = (args: readonly string[]) =>
      args[0] === 'repo'
        ? Promise.resolve(
            JSON.stringify([
              { name: 'alpha', owner: { login: 'sample-owner' }, isArchived: false, isFork: false },
              {
                name: 'org-repo',
                owner: { login: 'sample-org' },
                isArchived: false,
                isFork: false,
              },
            ]),
          )
        : base(args);
    const report = await createGitHubAdapter({ run }).fetch({ now: NOW });
    const flow = report.sections.flow!;
    if (flow.state !== 'value') throw new Error('expected a value');
    expect(flow.projects.map((p) => p.project)).toEqual(['alpha']);
  });

  it('refuses incomplete lists and unexpected output', async () => {
    const w = world();
    w.repos = [{ ...w.repos[1]!, hasIssues: true }];
    w.repos[0]!.openIssues = Array.from({ length: GH_LIST_LIMIT }, (_, i) => ({
      number: i + 1,
      title: 'Sample',
      createdAt: '2026-01-14T10:00:00Z',
      updatedAt: '2026-01-14T10:00:00Z',
    }));
    await expect(createGitHubAdapter({ run: fakeGh(w).run }).fetch({ now: NOW })).rejects.toThrow(
      'counts would be incomplete',
    );
    await expect(
      createGitHubAdapter({ run: () => Promise.resolve('not json') }).fetch({ now: NOW }),
    ).rejects.toThrow('gh api user: output is not JSON');
    await expect(
      createGitHubAdapter({ run: () => Promise.resolve('{"nope":1}') }).fetch({ now: NOW }),
    ).rejects.toThrow('unexpected shape for user');
  });

  it('stops when the collection is aborted', async () => {
    const gh = fakeGh(world());
    await expect(
      createGitHubAdapter({ run: gh.run }).fetch({ now: NOW, signal: { aborted: true } }),
    ).rejects.toThrow('aborted');
  });

  it('produces a report collectSnapshot accepts', async () => {
    const adapter = createGitHubAdapter({ run: fakeGh(world()).run });
    const { snapshot, failures } = await collectSnapshot([adapter], { now: NOW });
    expect(failures).toEqual([]);
    expect(snapshot.synthetic).toBeUndefined();
    expect(snapshot.flow.state).toBe('value');
    expect(snapshot.spend.state).toBe('no_data');
  });
});

describe('mapPool', () => {
  it('keeps order, caps concurrency and refuses a bad limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
    await expect(mapPool([1], 0, () => Promise.resolve(1))).rejects.toThrow(RangeError);
    expect(await mapPool([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});
