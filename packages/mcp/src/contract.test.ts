import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CONTRACT_PATH, fillBlocks, renderContract } from '../scripts/contract';
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
});
