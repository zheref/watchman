import type { GhRunner } from '../adapters/gh';

/**
 * A fake `gh` for tests: no process, no network. It answers the read-only calls the GitHub
 * adapter makes from a small synthetic world and records every call it receives.
 */

export interface FakePr {
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  isDraft?: boolean;
  reviewRequests?: { login?: string; name?: string }[];
  milestone?: { dueOn: string | null } | null;
  mergedAt?: string;
}

export interface FakeIssue {
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  stateReason?: string;
}

export interface FakeRepo {
  owner: string;
  name: string;
  isArchived?: boolean;
  isFork?: boolean;
  hasIssues?: boolean;
  parent?: { owner: string; name: string };
  openPrs?: FakePr[];
  mergedPrs?: FakePr[];
  openIssues?: FakeIssue[];
  closedIssues?: FakeIssue[];
}

export interface FakeWorld {
  viewer: string;
  accounts: Record<string, 'User' | 'Organization'>;
  repos: FakeRepo[];
}

const url = (repo: FakeRepo, kind: 'pull' | 'issues', n: number) =>
  `https://example.com/${repo.owner}/${repo.name}/${kind}/${n}`;

export function fakeGh(world: FakeWorld): { run: GhRunner; calls: string[][] } {
  const calls: string[][] = [];
  const flag = (args: readonly string[], name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const run: GhRunner = (args) => {
    calls.push([...args]);
    const [command, sub, third] = args;
    const reply = (value: unknown) => Promise.resolve(JSON.stringify(value));
    if (command === 'api' && sub === 'user') return reply({ login: world.viewer, type: 'User' });
    if (command === 'api' && sub?.startsWith('users/')) {
      const login = sub.slice('users/'.length);
      const type = world.accounts[login];
      return type ? reply({ login, type }) : Promise.reject(new Error('HTTP 404'));
    }
    if (command === 'repo' && sub === 'list') {
      return reply(
        world.repos
          .filter((r) => r.owner.toLowerCase() === String(third).toLowerCase())
          .map((r) => ({
            name: r.name,
            owner: { login: r.owner },
            isArchived: r.isArchived ?? false,
            isFork: r.isFork ?? false,
            hasIssuesEnabled: r.hasIssues ?? true,
            parent: r.parent ? { name: r.parent.name, owner: { login: r.parent.owner } } : null,
          })),
      );
    }
    if ((command === 'pr' || command === 'issue') && sub === 'list') {
      const full = flag(args, '--repo');
      const repo = world.repos.find((r) => `${r.owner}/${r.name}` === full);
      if (!repo) return Promise.reject(new Error('HTTP 404'));
      const state = flag(args, '--state');
      if (command === 'pr') {
        const rows = state === 'open' ? (repo.openPrs ?? []) : (repo.mergedPrs ?? []);
        return reply(
          rows.map((pr) => ({
            ...pr,
            url: url(repo, 'pull', pr.number),
            isDraft: pr.isDraft ?? false,
            reviewRequests: pr.reviewRequests ?? [],
            milestone: pr.milestone ?? null,
          })),
        );
      }
      // Like GitHub: a repository with issues turned off refuses the call.
      if (repo.hasIssues === false)
        return Promise.reject(new Error('the repository has disabled issues'));
      const rows = state === 'open' ? (repo.openIssues ?? []) : (repo.closedIssues ?? []);
      return reply(rows.map((issue) => ({ ...issue, url: url(repo, 'issues', issue.number) })));
    }
    return Promise.reject(new Error(`fake gh: unexpected call ${args.join(' ')}`));
  };
  return { run, calls };
}
