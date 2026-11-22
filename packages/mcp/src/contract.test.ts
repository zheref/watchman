import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_PATH, fillBlocks, renderContract, run } from '../scripts/contract';
import { TOOL_NAMES } from './server';

/**
 * CONTRACT.md's schemas and examples are generated from what the server advertises and returns.
 * This fails while the committed file differs: run `npm run contract --workspace @watchman/mcp`.
 */
describe('CONTRACT.md', () => {
  it('matches the schemas and examples the server produces', async () => {
    const committed = await readFile(CONTRACT_PATH, 'utf8');
    expect(committed).toBe(await renderContract(committed));
  });

  it('documents every tool, and only those', async () => {
    const committed = await readFile(CONTRACT_PATH, 'utf8');
    for (const name of TOOL_NAMES) expect(committed).toContain(`### \`${name}\``);
    expect(committed.match(/^### `/gm)).toHaveLength(TOOL_NAMES.length);
  });

  it('refuses a document that drops or invents a block', () => {
    const blocks = new Map([['a', 'A']]);
    expect(() => fillBlocks('no blocks', blocks)).toThrow(/missing generated blocks: a/);
    expect(() =>
      fillBlocks('<!-- BEGIN GENERATED: b -->\nx\n<!-- END GENERATED -->', blocks),
    ).toThrow(/unknown generated block: b/);
    expect(fillBlocks('<!-- BEGIN GENERATED: a -->\nold\n<!-- END GENERATED -->', blocks)).toBe(
      '<!-- BEGIN GENERATED: a -->\nA\n<!-- END GENERATED -->',
    );
  });

  it('checks, refuses a stale copy, and rewrites it with --write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'watchman-contract-'));
    const path = join(dir, 'CONTRACT.md');
    const lines: string[] = [];
    const report = (line: string) => lines.push(line);
    try {
      await copyFile(CONTRACT_PATH, path);
      expect(await run({ argv: [], path, report })).toBe(0);
      const current = await readFile(path, 'utf8');
      await writeFile(
        path,
        current.replace('"additionalProperties": false', '"additionalProperties": true'),
      );
      expect(await run({ argv: [], path, report })).toBe(1);
      expect(await run({ argv: ['--write'], path, report })).toBe(0);
      expect(await readFile(path, 'utf8')).toBe(current);
      expect(await run({ argv: ['--write'], path, report })).toBe(0);
      expect(lines).toEqual([
        'CONTRACT.md is current',
        'CONTRACT.md is out of date: run npm run contract --workspace @watchman/mcp',
        'CONTRACT.md rewritten',
        'CONTRACT.md is current',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
