import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOOL_NAMES } from './server';

/**
 * End to end: the real `bin/watchman-mcp.mjs`, spawned over stdio by the SDK's own client, exactly
 * as an MCP client would launch it. It lists the tools and calls each one, first against the
 * committed synthetic fixture (WATCHMAN_SNAPSHOT_DIR unset), then against a snapshot directory.
 */

const BIN = fileURLToPath(new URL('../bin/watchman-mcp.mjs', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../../core/fixtures/synthetic/', import.meta.url));
const NOW = '2026-01-14T15:00:00Z';

async function connect(env: Record<string, string>): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN],
    // Only the SDK's safe defaults plus what the test sets: a WATCHMAN_SNAPSHOT_DIR in the
    // developer's shell never reaches the server.
    env: { ...getDefaultEnvironment(), WATCHMAN_MCP_NOW: NOW, ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'watchman-e2e', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

type Json = Record<string, unknown> & { source: string; as_of: string };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { result, structured: result.structuredContent as Json, text: content[0]!.text };
}

describe('watchman-mcp over stdio, synthetic fixture', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect({});
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it('identifies itself', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'watchman' });
  });

  it('lists exactly the four read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.outputSchema, tool.name).toBeDefined();
    }
  });

  it('advertises over stdio the very schemas CONTRACT.md documents', async () => {
    const contract = await readFile(new URL('../CONTRACT.md', import.meta.url), 'utf8');
    const block = (id: string): unknown => {
      const start = contract.indexOf(`<!-- BEGIN GENERATED: ${id} -->`);
      if (start < 0) throw new Error(`no block ${id}`);
      const body = contract.slice(start, contract.indexOf('<!-- END GENERATED -->', start));
      return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
    };
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, tool.name).toEqual(block(`${tool.name}.input`));
      expect(tool.outputSchema, tool.name).toEqual(block(`${tool.name}.output`));
    }
  });

  it.each(TOOL_NAMES)(
    '%s answers compact JSON with source, as_of and the synthetic flag',
    async (name) => {
      const { result, structured, text } = await call(client, name);
      expect(result.isError).toBeFalsy();
      expect(text).toBe(JSON.stringify(structured));
      expect(text).not.toContain('\n');
      expect(structured.source).toEqual(expect.any(String));
      expect(Date.parse(structured.as_of)).not.toBeNaN();
      expect(structured).toMatchObject({
        synthetic: true,
        evaluated_at: '2026-01-14T15:00:00.000Z',
        snapshot: { origin: 'synthetic-fixture', file: 'synthetic fixture full.json' },
      });
    },
  );

  it('narrows get_attention by project and by time', async () => {
    const all = (await call(client, 'get_attention', { limit: 50 })).structured;
    const alpha = (await call(client, 'get_attention', { project: 'project alpha', limit: 50 }))
      .structured;
    const recent = (await call(client, 'get_attention', { window: '48h', limit: 50 })).structured;
    const items = (r: Json) =>
      (r.attention as { items: { project: string; waiting_since: string }[] }).items;
    expect(items(alpha).length).toBeGreaterThan(0);
    expect(items(alpha).length).toBeLessThan(items(all).length);
    expect(items(alpha).every((i) => i.project === 'Project Alpha')).toBe(true);
    expect(items(recent).length).toBeLessThan(items(all).length);
    expect(
      items(recent).every((i) => Date.parse(i.waiting_since) >= Date.parse('2026-01-12T15:00:00Z')),
    ).toBe(true);
    expect(alpha.filter).toEqual({ project: 'project alpha' });
    expect(recent.filter).toEqual({ since: '2026-01-12T15:00:00.000Z' });
  });

  it('answers no_data for spend by project, never an invented figure', async () => {
    const { structured } = await call(client, 'get_spend', { project: 'Project Alpha' });
    expect(structured.spend).toMatchObject({
      state: 'no_data',
      reason: expect.stringMatching(/per provider/),
    });
  });

  it('reports an invalid filter as a tool error the caller can read', async () => {
    const bad = await client.callTool({ name: 'get_flow', arguments: { window: 'a week' } });
    expect(bad.isError).toBe(true);
    const extra = await client.callTool({ name: 'get_flow', arguments: { delete: true } });
    expect(extra.isError).toBe(true);
  });

  it('refuses a tool it does not have', async () => {
    await expect(client.callTool({ name: 'merge_pr', arguments: {} })).rejects.toThrow();
  });
});

describe('watchman-mcp over stdio, snapshot directory', () => {
  let dir: string;
  let client: Client;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'watchman-mcp-e2e-'));
    await copyFile(join(FIXTURES, 'sparse.json'), join(dir, 'snapshot-2026-01-14T15-00-00Z.json'));
    client = await connect({ WATCHMAN_SNAPSHOT_DIR: dir });
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the newest snapshot file and never names the directory', async () => {
    for (const name of TOOL_NAMES) {
      const { structured, text } = await call(client, name);
      expect(structured.snapshot).toMatchObject({
        origin: 'file',
        file: 'file:snapshot-2026-01-14T15-00-00Z.json',
      });
      expect(text).not.toContain(dir);
    }
  });

  it('returns sixteen metric cells for a project, value or no_data', async () => {
    const { structured } = await call(client, 'get_metrics');
    const metrics = structured.metrics as {
      state: string;
      projects: { metrics: { name: string; state: string }[] }[];
    };
    expect(metrics.state).toBe('value');
    expect(metrics.projects[0]!.metrics).toHaveLength(16);
    expect(metrics.projects[0]!.metrics.some((m) => m.state === 'value')).toBe(true);
    expect(metrics.projects[0]!.metrics.some((m) => m.state === 'no_data')).toBe(true);
  });
});

describe('watchman-mcp startup', () => {
  it('refuses any transport but stdio', async () => {
    await expect(connect({ WATCHMAN_MCP_TRANSPORT: 'http' })).rejects.toThrow();
  }, 30_000);
});
