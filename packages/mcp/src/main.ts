import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { isoDateTime } from '@watchman/core';
import { DEFAULT_TRANSPORT, assertSafeTransport, type Transport } from './bind';
import { createWatchmanServer } from './server';
import { loadSnapshot } from './snapshot';

/**
 * The server's entry: stdio only. stdout is the protocol channel, so nothing here writes to it;
 * startup problems go to stderr and a non-zero exit code.
 */

/** Selects the transport. Only `stdio` (the default) exists; anything else refuses to start. */
export const TRANSPORT_ENV = 'WATCHMAN_MCP_TRANSPORT';

/** Pins the evaluation instant (ISO 8601) for reproducible answers; the system clock otherwise. */
export const NOW_ENV = 'WATCHMAN_MCP_NOW';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The transport for `env`, already through the safety guard. There is no HTTP transport: asking
 * for one is refused here rather than silently falling back, and any future one must pass
 * {@link assertSafeTransport} (loopback, bearer token, Origin allow-list) before it binds.
 */
export function resolveTransport(env: Env): Transport {
  const kind = env[TRANSPORT_ENV]?.trim() || 'stdio';
  if (kind !== 'stdio') {
    throw new Error(`${TRANSPORT_ENV}=${JSON.stringify(kind)} is not supported; only stdio is`);
  }
  return assertSafeTransport(DEFAULT_TRANSPORT);
}

/** The clock for `env`: fixed at {@link NOW_ENV} when set (and valid), else the system clock. */
export function resolveClock(env: Env): () => Date {
  const pinned = env[NOW_ENV]?.trim();
  if (!pinned) return () => new Date();
  if (!isoDateTime.safeParse(pinned).success) {
    throw new Error(`${NOW_ENV} must be an ISO 8601 date-time with an offset`);
  }
  const at = Date.parse(pinned);
  return () => new Date(at);
}

export interface MainIo {
  env: Env;
  /** Where startup errors go; stderr in production. */
  error: (message: string) => void;
  serve?: typeof serveStdio;
}

/** Starts the server over stdio. Returns the handle, or `null` after reporting a startup error. */
export function main(
  io: MainIo = { env: process.env, error: (m) => process.stderr.write(`${m}\n`) },
): StdioServerHandle | null {
  const serve = io.serve ?? serveStdio;
  try {
    resolveTransport(io.env);
    const now = resolveClock(io.env);
    return serve(() => createWatchmanServer({ now, load: (at) => loadSnapshot(io.env, at) }), {
      onerror: (error) => io.error(`watchman-mcp: ${error.message}`),
    });
  } catch (error) {
    io.error(`watchman-mcp: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
