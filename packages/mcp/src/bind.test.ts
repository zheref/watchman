import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSPORT, assertSafeTransport, isLoopbackHost } from './index';

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

describe('assertSafeTransport', () => {
  it('defaults to stdio', () => {
    expect(assertSafeTransport(DEFAULT_TRANSPORT)).toEqual({ kind: 'stdio' });
  });

  it('allows HTTP on loopback only', () => {
    expect(assertSafeTransport({ kind: 'http', host: '127.0.0.1', port: 7311 }).kind).toBe('http');
    expect(() => assertSafeTransport({ kind: 'http', host: '0.0.0.0', port: 7311 })).toThrow(
      /non-loopback/,
    );
  });

  it('rejects an invalid port', () => {
    expect(() => assertSafeTransport({ kind: 'http', host: 'localhost', port: 0 })).toThrow(
      RangeError,
    );
  });
});
