import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSPORT,
  assertSafeTransport,
  isLoopbackHost,
  isLoopbackOrigin,
  type HttpTransport,
} from './index';

const http = (overrides: Partial<HttpTransport> = {}): HttpTransport => ({
  kind: 'http',
  host: '127.0.0.1',
  port: 7311,
  bearerTokenEnv: 'WATCHMAN_MCP_TOKEN',
  allowedOrigins: ['http://127.0.0.1:7311'],
  ...overrides,
});

describe('isLoopbackHost', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '::1', '[::1]'])(
    'accepts %s',
    (host) => expect(isLoopbackHost(host)).toBe(true),
  );

  it.each(['0.0.0.0', '192.168.1.10', '::', 'example.com', '127.0.0.256', '127.0.0', ''])(
    'rejects %s',
    (host) => expect(isLoopbackHost(host)).toBe(false),
  );
});

describe('isLoopbackOrigin', () => {
  it.each(['http://localhost:3000', 'https://127.0.0.1', 'http://[::1]:7311'])('accepts %s', (o) =>
    expect(isLoopbackOrigin(o)).toBe(true),
  );

  it.each([
    'https://example.com',
    'http://localhost.example.com',
    'http://localhost:3000/path',
    'file:///tmp',
    'null',
    '',
  ])('rejects %s', (o) => expect(isLoopbackOrigin(o)).toBe(false));
});

describe('assertSafeTransport', () => {
  it('defaults to stdio', () => {
    expect(assertSafeTransport(DEFAULT_TRANSPORT)).toEqual({ kind: 'stdio' });
  });

  it('allows authenticated HTTP on loopback only', () => {
    expect(assertSafeTransport(http()).kind).toBe('http');
    expect(() => assertSafeTransport(http({ host: '0.0.0.0' }))).toThrow(/non-loopback host/);
  });

  it('rejects an invalid port', () => {
    expect(() => assertSafeTransport(http({ port: 0 }))).toThrow(RangeError);
  });

  it('refuses HTTP without a bearer-token variable name', () => {
    expect(() => assertSafeTransport(http({ bearerTokenEnv: '' }))).toThrow(/bearer-token/);
    expect(() => assertSafeTransport(http({ bearerTokenEnv: 'sk-literal-value' }))).toThrow(
      /bearer-token/,
    );
  });

  it('refuses HTTP without a loopback-only Origin allow-list', () => {
    expect(() => assertSafeTransport(http({ allowedOrigins: [] }))).toThrow(/allow-list/);
    expect(() =>
      assertSafeTransport(http({ allowedOrigins: ['http://localhost:3000', 'https://evil.test'] })),
    ).toThrow(/non-loopback allowed origin "https:\/\/evil.test"/);
  });
});
