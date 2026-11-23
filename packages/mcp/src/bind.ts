/**
 * Where the MCP server may listen. The server is read-only and must never be reachable
 * unauthenticated, so by default it speaks stdio. An HTTP transport is refused unless it binds to
 * a loopback address AND carries both an authentication requirement and an Origin allow-list:
 * loopback alone is not authentication (any local process can connect, and a browser page can
 * reach a loopback server through DNS rebinding unless Origin is checked). The server itself
 * arrives in a later phase; this guard is the contract it must call first.
 */
export type HttpTransport = {
  kind: 'http';
  host: string;
  port: number;
  /** Name of the server-side environment variable holding the bearer token. Never the token. */
  bearerTokenEnv: string;
  /** Origins the server accepts; each must itself be a loopback origin. */
  allowedOrigins: readonly string[];
};

export type Transport = { kind: 'stdio' } | HttpTransport;

export const DEFAULT_TRANSPORT: Transport = { kind: 'stdio' };

const LOOPBACK_NAMES = new Set(['localhost', '::1', '[::1]']);
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** True when `host` resolves only to this machine (localhost, 127.0.0.0/8 or ::1). */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (LOOPBACK_NAMES.has(normalized)) return true;
  const octets = normalized.split('.');
  if (octets.length !== 4 || octets[0] !== '127') return false;
  return octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** True when `origin` is an http(s) origin (no path) whose host is loopback. */
export function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== origin) return false;
  return isLoopbackHost(url.hostname);
}

/**
 * Throws unless the transport is stdio, or HTTP that is loopback-bound on a valid port, names a
 * bearer-token environment variable and allows only loopback origins.
 */
export function assertSafeTransport(transport: Transport): Transport {
  if (transport.kind === 'stdio') return transport;
  if (!isLoopbackHost(transport.host)) {
    throw new Error(`refusing to bind MCP over HTTP to non-loopback host "${transport.host}"`);
  }
  if (!Number.isInteger(transport.port) || transport.port < 1 || transport.port > 65535) {
    throw new RangeError(`invalid port ${String(transport.port)}`);
  }
  if (!ENV_NAME.test(transport.bearerTokenEnv ?? '')) {
    throw new Error('refusing MCP over HTTP without a bearer-token environment variable name');
  }
  const origins = transport.allowedOrigins ?? [];
  if (origins.length === 0) {
    throw new Error('refusing MCP over HTTP without an Origin allow-list');
  }
  const foreign = origins.find((origin) => !isLoopbackOrigin(origin));
  if (foreign !== undefined) {
    throw new Error(`refusing MCP over HTTP with non-loopback allowed origin "${foreign}"`);
  }
  return transport;
}
