/**
 * Where the MCP server may listen. The server is read-only and must never be reachable
 * unauthenticated, so by default it speaks stdio, and an HTTP transport may only bind to a
 * loopback address. The server itself arrives in a later phase; this guard comes first.
 */
export type Transport = { kind: 'stdio' } | { kind: 'http'; host: string; port: number };

export const DEFAULT_TRANSPORT: Transport = { kind: 'stdio' };

const LOOPBACK_NAMES = new Set(['localhost', '::1', '[::1]']);

/** True when `host` resolves only to this machine (localhost, 127.0.0.0/8 or ::1). */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (LOOPBACK_NAMES.has(normalized)) return true;
  const octets = normalized.split('.');
  if (octets.length !== 4 || octets[0] !== '127') return false;
  return octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Throws unless the transport is stdio or HTTP bound to loopback on a valid port. */
export function assertSafeTransport(transport: Transport): Transport {
  if (transport.kind === 'stdio') return transport;
  if (!isLoopbackHost(transport.host)) {
    throw new Error(`refusing to bind MCP over HTTP to non-loopback host "${transport.host}"`);
  }
  if (!Number.isInteger(transport.port) || transport.port < 1 || transport.port > 65535) {
    throw new RangeError(`invalid port ${String(transport.port)}`);
  }
  return transport;
}
