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
    [['api', 'user', '--jq', '.login']],
    [['pr', 'list', '--repo=sample-owner/alpha', '--state=open', '-L', '10']],
    [['repo', 'list', '--source', '--no-archived']],
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
    // Attached and bundled short flags, flags hiding the path, stray arguments.
    [['api', 'repos/o/r/issues', '-ftitle=x']],
    [['api', 'repos/o/r/issues', '-Ftitle=x']],
    [['api', '-iXPOST', 'repos/o/r']],
    [['api', '-iX', 'DELETE', 'repos/o/r']],
    [['api', '-H', 'Accept: x', 'graphql', '-fquery=mutation']],
    [['api', '--jq', '.x', 'graphql']],
    [['api', 'user', 'extra']],
    [['pr', 'list', '-ws', 'open']],
    [['pr', 'list', '--state']],
    [['pr', 'list', 'stray']],
    [['repo', 'list', '--source=yes']],
    [['repo', 'list', 'a', 'b']],
    [['api', 'https://evil.example/x']],
    [['api', 'repos/o/../../x']],
    [['api', 'repos/o/r issues']],
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
    // Spacing, punctuation, case, width and zero-width characters do not get round it.
    for (const text of [
      'Global Logic',
      'global_logic',
      'GLOBAL-LOGIC',
      'ｇｌｏｂａｌｌｏｇｉｃ',
      'in\u200bsulet',
      'In.Su.Let',
    ]) {
      expect(isAlwaysExcluded(text)).toBe(true);
    }
    expect(isAlwaysExcluded('a global logical step')).toBe(true);
    expect(isAlwaysExcluded('Sample insurance list')).toBe(false);
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
