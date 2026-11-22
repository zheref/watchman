import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { assertSnapshot } from '@watchman/core';
import sparse from '@watchman/core/fixtures/synthetic/sparse.json' with { type: 'json' };
import { TOOL_NAMES, createWatchmanServer, type ToolName } from '../src/server';
import { loadSnapshot, type LoadedSnapshot } from '../src/snapshot';

/**
 * Generates the machine-made parts of CONTRACT.md from the server itself: each tool's input and
 * output JSON Schema exactly as `tools/list` advertises them, and each example response exactly as
 * `tools/call` returns it, at a pinned instant against synthetic fixtures. The prose around them is
 * hand-written; only the text between `<!-- BEGIN GENERATED: id -->` and `<!-- END GENERATED -->`
 * is replaced.
 *
 * `npm run contract --workspace @watchman/mcp` rewrites the file; contract.test.ts fails while the
 * committed file differs from what this renders.
 */

export const CONTRACT_PATH = fileURLToPath(new URL('../CONTRACT.md', import.meta.url));

/** The instant every example is evaluated at: just after the fixtures were generated. */
export const EXAMPLE_NOW = new Date('2026-01-14T15:00:00Z');

interface Example {
  id: string;
  tool: ToolName;
  arguments: Record<string, unknown>;
  /** Which synthetic data answers it. */
  data: 'fixture' | 'sparse';
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'get_attention',
    tool: 'get_attention',
    arguments: { project: 'Project Alpha', limit: 2 },
    data: 'fixture',
  },
  {
    id: 'get_flow',
    tool: 'get_flow',
    arguments: { project: 'Sample Orchard', window: '7d' },
    data: 'fixture',
  },
  { id: 'get_spend', tool: 'get_spend', arguments: { window: '2d' }, data: 'fixture' },
  { id: 'get_metrics', tool: 'get_metrics', arguments: {}, data: 'fixture' },
  { id: 'get_metrics.sparse', tool: 'get_metrics', arguments: { window: '30d' }, data: 'sparse' },
];

const SPARSE: LoadedSnapshot = {
  snapshot: assertSnapshot(sparse, 'sparse.json'),
  origin: 'file',
  source: 'file:snapshot-2026-01-14T15-00-00Z.json',
  skipped: [],
};

async function connect(data: Example['data']): Promise<Client> {
  const server = createWatchmanServer({
    now: () => EXAMPLE_NOW,
    load: (now) => (data === 'sparse' ? Promise.resolve(SPARSE) : loadSnapshot({}, now)),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'watchman-contract', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

const json = (value: unknown) => ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

/** Every generated block, by id. */
export async function renderBlocks(): Promise<Map<string, string>> {
  const blocks = new Map<string, string>();
  const clients = { fixture: await connect('fixture'), sparse: await connect('sparse') };
  try {
    const { tools } = await clients.fixture.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    blocks.set(
      'tools',
      [
        '| Tool | Title | Annotations |',
        '| ---- | ----- | ----------- |',
        ...TOOL_NAMES.map((name) => {
          const tool = byName.get(name)!;
          const hints = Object.entries(tool.annotations ?? {})
            .filter(([key]) => key.endsWith('Hint'))
            .map(([key, value]) => `\`${key}: ${String(value)}\``)
            .join(', ');
          return `| \`${name}\` | ${tool.title ?? ''} | ${hints} |`;
        }),
      ].join('\n'),
    );
    for (const name of TOOL_NAMES) {
      const tool = byName.get(name)!;
      blocks.set(`${name}.description`, tool.description ?? '');
      blocks.set(`${name}.input`, json(tool.inputSchema));
      blocks.set(`${name}.output`, json(tool.outputSchema));
    }
    for (const example of EXAMPLES) {
      const call = { name: example.tool, arguments: example.arguments };
      const result = await clients[example.data].callTool(call);
      blocks.set(`${example.id}.call`, json(call));
      blocks.set(`${example.id}.response`, json(result.structuredContent));
    }
  } finally {
    await clients.fixture.close();
    await clients.sparse.close();
  }
  return blocks;
}

const BLOCK = /<!-- BEGIN GENERATED: ([\w.]+) -->\n[\s\S]*?<!-- END GENERATED -->/g;

/**
 * `document` with every generated block replaced by its rendering. Throws when the document names
 * a block that does not exist, or leaves out one that does, so neither side can drift silently.
 */
export function fillBlocks(document: string, blocks: ReadonlyMap<string, string>): string {
  const seen = new Set<string>();
  const filled = document.replace(BLOCK, (_match, id: string) => {
    const body = blocks.get(id);
    if (body === undefined) throw new Error(`CONTRACT.md names an unknown generated block: ${id}`);
    seen.add(id);
    return `<!-- BEGIN GENERATED: ${id} -->\n${body}\n<!-- END GENERATED -->`;
  });
  const missing = [...blocks.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`CONTRACT.md is missing generated blocks: ${missing.join(', ')}`);
  }
  return filled;
}

/**
 * The document CONTRACT.md should hold: its blocks filled, then formatted by the repository's
 * Prettier config, so `npm run lint` and the contract test agree on every byte.
 */
export async function renderContract(current: string): Promise<string> {
  const filled = fillBlocks(current, await renderBlocks());
  const options = (await resolveConfig(CONTRACT_PATH)) ?? {};
  return format(filled, { ...options, filepath: CONTRACT_PATH });
}

export interface RunIo {
  argv: readonly string[];
  /** The contract file; CONTRACT.md by default. */
  path?: string;
  report: (line: string) => void;
}

/**
 * Checks the contract file (exit code 1 when it is out of date), or rewrites it with `--write`.
 * Returns the exit code.
 */
export async function run(io: RunIo): Promise<number> {
  const path = io.path ?? CONTRACT_PATH;
  const current = await readFile(path, 'utf8');
  const next = await renderContract(current);
  if (io.argv.includes('--write')) {
    await writeFile(path, next);
    io.report(next === current ? 'CONTRACT.md is current' : 'CONTRACT.md rewritten');
    return 0;
  }
  if (next !== current) {
    io.report('CONTRACT.md is out of date: run npm run contract --workspace @watchman/mcp');
    return 1;
  }
  io.report('CONTRACT.md is current');
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await run({
    argv: process.argv.slice(2),
    report: (line) => process.stderr.write(`${line}\n`),
  });
}
