import { describe, expect, it } from 'vitest';
import {
  ALWAYS_EXCLUDED,
  GhWriteRefusedError,
  assertReadOnlyGh,
  compileExclusions,
  ghJson,
  isAlwaysExcluded,
  readOnlyGh,
} from '../index';

describe('assertReadOnlyGh', () => {
  it.each([
    [['api', 'user']],
    [['api', 'users/sample-owner']],
    [['api', 'repos/sample-owner/alpha/milestones', '--paginate']],
    [['repo', 'list', 'sample-owner', '--json', 'name']],
    [['pr', 'list', '--repo', 'sample-owner/alpha', '--state', 'open']],
    [['issue', 'list', '--repo', 'sample-owner/alpha', '--search', 'closed:>=2026-01-05']],
  ])('allows the read %j', (args) => {
    expect(() => assertReadOnlyGh(args)).not.toThrow();
  });

  it.each([
    [[]],
    [['api']],
    [['api', 'graphql']],
    [['api', '/graphql']],
    [['api', '-X', 'POST', 'repos/a/b/issues']],
    [['api', '-XDELETE', 'repos/a/b']],
    [['api', '--method=PATCH', 'repos/a/b']],
    [['api', 'repos/a/b/issues', '-f', 'title=x']],
    [['api', 'repos/a/b/issues', '-F', 'title=x']],
    [['api', 'repos/a/b/issues', '--raw-field', 'title=x']],
    [['api', 'repos/a/b/issues', '--input', 'body.json']],
    [['pr', 'merge', '1']],
    [['pr', 'create']],
    [['issue', 'close', '1']],
    [['repo', 'delete', 'a/b']],
    [['pr', 'list', '--web']],
    [['auth', 'token']],
  ])('refuses %j', (args) => {
    expect(() => assertReadOnlyGh(args)).toThrow(GhWriteRefusedError);
  });

  it('wraps a runner so a refused command never reaches it', async () => {
    const seen: string[][] = [];
    const run = readOnlyGh((args) => {
      seen.push([...args]);
      return Promise.resolve('[]');
    });
    await expect(run(['pr', 'merge', '1'])).rejects.toThrow(GhWriteRefusedError);
    expect(seen).toEqual([]);
    await expect(run(['pr', 'list'])).resolves.toBe('[]');
    expect(seen).toEqual([['pr', 'list']]);
    await expect(ghJson(() => Promise.reject('plain'), ['api', 'user'])).rejects.toBe('plain');
  });
});

describe('exclusions', () => {
  it('always excludes NDA-named owners and repositories, in any case', () => {
    expect(ALWAYS_EXCLUDED).toHaveLength(2);
    const excluded = compileExclusions([]);
    expect(excluded({ owner: 'sample-owner', name: 'GLOBALLOGIC-notes' })).toBe(true);
    expect(excluded({ owner: 'sample-owner', name: 'my-insulet-port' })).toBe(true);
    expect(excluded({ owner: 'GlobalLogic', name: 'anything' })).toBe(true);
    expect(excluded({ owner: 'sample-owner', name: 'alpha' })).toBe(false);
    expect(isAlwaysExcluded('https://example.com/insulet/x')).toBe(true);
  });

  it('matches configured names, owner/name pairs and globs case-insensitively', () => {
    const excluded = compileExclusions([
      'Old-Experiment',
      'scratch-*',
      'v?',
      'sample-owner/notes',
      '  ',
    ]);
    const repo = (name: string, owner = 'sample-owner') => ({ owner, name });
    expect(excluded(repo('old-experiment'))).toBe(true);
    expect(excluded(repo('scratch-2026'))).toBe(true);
    expect(excluded(repo('v1'))).toBe(true);
    expect(excluded(repo('v10'))).toBe(false);
    expect(excluded(repo('notes'))).toBe(true);
    expect(excluded(repo('notes', 'someone-else'))).toBe(false);
    expect(excluded(repo('alpha.beta'))).toBe(false);
    expect(compileExclusions(['alpha.beta'])(repo('alphaxbeta'))).toBe(false);
  });
});
