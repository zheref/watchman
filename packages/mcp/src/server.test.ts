import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import {
  READ_ONLY_ANNOTATIONS,
  SERVER_VERSION,
  TOOL_NAMES,
  createWatchmanServer,
  resolveFilter,
  type ServerDeps,
} from './server';
import { loadSnapshot } from './snapshot';

const NOW = new Date('2026-01-14T15:00:00Z');
const clients: Client[] = [];

async function connect(deps: Partial<ServerDeps> = {}): Promise<Client> {
  const server = createWatchmanServer({
    now: () => NOW,
    load: (now) => loadSnapshot({}, now),
    ...deps,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'watchman-test', version: '0.0.0' });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe('the registered tool list', () => {
  it('is exactly the four read tools: adding any other tool, a write tool included, fails here', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'get_attention',
      'get_flow',
      'get_spend',
      'get_metrics',
    ]);
    expect(TOOL_NAMES).toEqual(['get_attention', 'get_flow', 'get_spend', 'get_metrics']);
  });

  it('annotates every tool read-only, non-destructive, idempotent and closed-world', async () => {
    const { tools } = await (await connect()).listTools();
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject(READ_ONLY_ANNOTATIONS);
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.description, tool.name).toMatch(/source and as_of/);
    }
  });

  it('advertises tools only: no resources and no prompts', async () => {
    const client = await connect();
    const capabilities = client.getServerCapabilities() ?? {};
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.resources).toBeUndefined();
    expect(capabilities.prompts).toBeUndefined();
  });

  it('carries the package version', async () => {
    expect(SERVER_VERSION).toBe(pkg.version);
    expect((await connect()).getServerVersion()).toMatchObject({
      name: 'watchman',
      version: pkg.version,
    });
  });
});

describe('tool calls', () => {
  it('reads the snapshot afresh on every call, at the instant of the call', async () => {
    const seen: string[] = [];
    const client = await connect({
      load: (now) => {
        seen.push(now.toISOString());
        return loadSnapshot({}, now);
      },
    });
    await client.callTool({ name: 'get_flow', arguments: {} });
    await client.callTool({ name: 'get_spend', arguments: {} });
    expect(seen).toEqual([NOW.toISOString(), NOW.toISOString()]);
  });

  it('applies the limit and the filter', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'get_attention',
      arguments: { project: ' Project Alpha ', window: '7d', limit: 1 },
    });
    expect(result.structuredContent).toMatchObject({
      filter: { project: 'Project Alpha', since: '2026-01-07T15:00:00.000Z' },
      attention: { items: [{ project: 'Project Alpha' }] },
    });
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 51 }],
    [{ window: '400d' }],
    [{ since: '2026-01-14' }],
    [{ project: '' }],
    [{ state: 'closed' }],
  ])('refuses invalid input %j as a tool error', async (args) => {
    const result = await (await connect()).callTool({ name: 'get_attention', arguments: args });
    expect(result.isError).toBe(true);
  });

  it('reports a failed read without leaking its message', async () => {
    const client = await connect({ load: () => Promise.reject(new Error('EACCES /secret/path')) });
    const result = await client.callTool({ name: 'get_metrics', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('the snapshot could not be read');
    expect(JSON.stringify(result.content)).not.toContain('/secret/path');
  });

  it("passes a core RangeError's own message through", async () => {
    const client = await connect({
      load: () => Promise.reject(new RangeError('window must be at most 366d, got 9999d')),
    });
    const result = await client.callTool({ name: 'get_flow', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('at most 366d');
  });
});

describe('resolveFilter', () => {
  it('echoes the project and resolves the bound', () => {
    expect(resolveFilter({}, NOW)).toEqual({});
    expect(resolveFilter({ project: 'A', window: '1d' }, NOW)).toEqual({
      project: 'A',
      since: '2026-01-13T15:00:00.000Z',
    });
  });
});
