import { McpServer, type CallToolResult, type ToolAnnotations } from '@modelcontextprotocol/server';
import { ATTENTION_LIMIT, resolveSince } from '@watchman/core';
import pkg from '../package.json' with { type: 'json' };
import {
  attentionInputSchema,
  attentionOutputSchema,
  filterInputSchema,
  flowOutputSchema,
  metricsOutputSchema,
  spendOutputSchema,
  type FilterInput,
} from './schemas';
import type { LoadedSnapshot } from './snapshot';
import { attentionView, flowView, metricsView, spendView, type ResolvedFilter } from './views';

/**
 * The Watchman MCP server: four read-only tools over the snapshot, and nothing else — no
 * resources, no prompts, no tool that changes anything anywhere. `TOOL_NAMES` is the whole list;
 * a test asserts the server advertises exactly it, so a write tool cannot be added quietly.
 */

export const SERVER_NAME = 'watchman';
export const SERVER_VERSION: string = pkg.version;

export const TOOL_NAMES = ['get_attention', 'get_flow', 'get_spend', 'get_metrics'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Every tool reads a local snapshot and returns it: read-only, never destructive, the same answer
 * for the same snapshot and instant, and no outside world touched.
 */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

export interface ServerDeps {
  /** Reads the snapshot afresh for one call; `loadSnapshot(process.env, now)` in production. */
  load: (now: Date) => Promise<LoadedSnapshot>;
  /** The instant a call is evaluated at. */
  now: () => Date;
}

const FILTER_HELP =
  'Filters: project (one project, case-insensitive), since (ISO 8601) and/or window (e.g. 7d). ' +
  'Compact JSON; the top level carries source and as_of, and missing data is an explicit ' +
  'no_data record with a reason.';

export const TOOL_DESCRIPTIONS: Record<ToolName, { title: string; description: string }> = {
  get_attention: {
    title: 'Attention',
    description:
      'Items waiting on the owner (decisions, blocked handoff cards, pull requests waiting over ' +
      '48h), ranked by value × urgency, each with the deep link where it is acted on. A time ' +
      `filter keeps items waiting since then; limit (1-50, default ${ATTENTION_LIMIT}) caps the list. ` +
      FILTER_HELP,
  },
  get_flow: {
    title: 'Flow',
    description:
      'Open pull requests and issues per project, throughput this week against last, items stale ' +
      'for more than 3 days, and handoff board cards by state. A time filter narrows the stale ' +
      'list to items active since then and adds counts opened and completed since then. ' +
      FILTER_HELP,
  },
  get_spend: {
    title: 'Spend',
    description:
      "Each AI provider's quota used against its next reset, with a countdown, and the month's " +
      'USD/COP cost with which providers are missing; manual entries are marked manual. A time ' +
      'filter turns readings older than it into no_data; spend is not per project, so a project ' +
      'filter answers no_data. ' +
      FILTER_HELP,
  },
  get_metrics: {
    title: 'Metrics',
    description:
      'The sixteen merge-priority metrics per project with latest value and change; a metric ' +
      'nobody reports is no_data, never a made-up value. A time filter keeps points since then. ' +
      FILTER_HELP,
  },
};

/** Turns validated filter input into the bound views use. Throws `RangeError` on a bad bound. */
export function resolveFilter(input: FilterInput, now: Date): ResolvedFilter {
  const since = resolveSince({ since: input.since, window: input.window }, now);
  return {
    ...(input.project !== undefined ? { project: input.project } : {}),
    ...(since !== undefined ? { since } : {}),
  };
}

function result(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

function failure(error: unknown): CallToolResult {
  // Only a message core wrote (no path, no file fragment); anything else is reported generically.
  const message = error instanceof RangeError ? error.message : 'the snapshot could not be read';
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Builds a fresh server instance with the four tools registered. */
export function createWatchmanServer(deps: ServerDeps): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: 'Watchman (read-only)',
    version: SERVER_VERSION,
  });

  const run =
    <I extends FilterInput>(build: (loaded: LoadedSnapshot, input: I, now: Date) => object) =>
    async (input: I): Promise<CallToolResult> => {
      try {
        const now = deps.now();
        return result(build(await deps.load(now), input, now) as Record<string, unknown>);
      } catch (error) {
        return failure(error);
      }
    };

  const config = (name: ToolName) => ({
    ...TOOL_DESCRIPTIONS[name],
    annotations: { title: TOOL_DESCRIPTIONS[name].title, ...READ_ONLY_ANNOTATIONS },
  });

  server.registerTool(
    'get_attention',
    {
      ...config('get_attention'),
      inputSchema: attentionInputSchema,
      outputSchema: attentionOutputSchema,
    },
    run((loaded, input, now) =>
      attentionView(loaded, resolveFilter(input, now), now, input.limit ?? ATTENTION_LIMIT),
    ),
  );
  server.registerTool(
    'get_flow',
    { ...config('get_flow'), inputSchema: filterInputSchema, outputSchema: flowOutputSchema },
    run((loaded, input, now) => flowView(loaded, resolveFilter(input, now), now)),
  );
  server.registerTool(
    'get_spend',
    { ...config('get_spend'), inputSchema: filterInputSchema, outputSchema: spendOutputSchema },
    run((loaded, input, now) => spendView(loaded, resolveFilter(input, now), now)),
  );
  server.registerTool(
    'get_metrics',
    { ...config('get_metrics'), inputSchema: filterInputSchema, outputSchema: metricsOutputSchema },
    run((loaded, input, now) => metricsView(loaded, resolveFilter(input, now), now)),
  );

  return server;
}
