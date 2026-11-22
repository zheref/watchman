import type { McpServerFactory } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { NOW_ENV, TRANSPORT_ENV, main, resolveClock, resolveTransport } from './main';

describe('resolveTransport', () => {
  it('is stdio by default and when asked for', () => {
    expect(resolveTransport({})).toEqual({ kind: 'stdio' });
    expect(resolveTransport({ [TRANSPORT_ENV]: ' stdio ' })).toEqual({ kind: 'stdio' });
    expect(resolveTransport({ [TRANSPORT_ENV]: '' })).toEqual({ kind: 'stdio' });
  });

  it.each(['http', 'sse', 'tcp://0.0.0.0:7311'])('refuses %s', (kind) => {
    expect(() => resolveTransport({ [TRANSPORT_ENV]: kind })).toThrow(/only stdio/);
  });
});

describe('resolveClock', () => {
  it('uses the system clock by default', () => {
    const before = Date.now();
    const at = resolveClock({})().getTime();
    expect(at).toBeGreaterThanOrEqual(before);
  });

  it('pins the instant when asked', () => {
    const clock = resolveClock({ [NOW_ENV]: '2026-01-14T10:00:00-05:00' });
    expect(clock().toISOString()).toBe('2026-01-14T15:00:00.000Z');
    expect(clock()).not.toBe(clock());
  });

  it('refuses a malformed instant', () => {
    expect(() => resolveClock({ [NOW_ENV]: 'tomorrow' })).toThrow(/ISO 8601/);
  });
});

describe('main', () => {
  it('serves a fresh server per connection over stdio, reporting transport errors to stderr', async () => {
    const handle = { close: vi.fn(() => Promise.resolve()) };
    let factory: McpServerFactory | undefined;
    let onerror: ((error: Error) => void) | undefined;
    const errors: string[] = [];
    const serve = vi.fn((f: McpServerFactory, options?: { onerror?: (error: Error) => void }) => {
      factory = f;
      onerror = options?.onerror;
      return handle;
    });
    expect(main({ env: {}, error: (m) => errors.push(m), serve })).toBe(handle);
    expect(serve).toHaveBeenCalledOnce();
    expect(factory).toBeDefined();
    onerror?.(new Error('broken pipe'));
    expect(errors).toEqual(['watchman-mcp: broken pipe']);
  });

  it('refuses to start, on stderr, with an unsupported transport or a bad clock', () => {
    for (const env of [{ [TRANSPORT_ENV]: 'http' }, { [NOW_ENV]: 'soon' }]) {
      const errors: string[] = [];
      const serve = vi.fn();
      expect(main({ env, error: (m) => errors.push(m), serve })).toBeNull();
      expect(serve).not.toHaveBeenCalled();
      expect(errors[0]).toMatch(/^watchman-mcp: /);
    }
  });
});
