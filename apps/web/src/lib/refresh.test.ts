import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDLE_MS,
  PAGE_REFRESH_MS,
  SERVER_EXPIRE_SECONDS,
  SERVER_REVALIDATE_SECONDS,
  refreshBootScript,
  scheduleRefresh,
  type RefreshHost,
} from './refresh';

const MINUTE = 60 * 1000;

function fakeHost() {
  const listeners = new Map<string, () => void>();
  const docListeners = new Map<string, () => void>();
  const host: RefreshHost & { reloads: number } = {
    reloads: 0,
    addEventListener: (type, listener) => void listeners.set(type, listener),
    setInterval: (handler, ms) => setInterval(handler, ms),
    document: {
      visibilityState: 'visible',
      addEventListener: (type, listener) => void docListeners.set(type, listener),
    },
    location: { reload: () => void (host.reloads += 1) },
  };
  return { host, input: () => listeners.get('keydown')!(), visibility: docListeners };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the open-page refresh', () => {
  it('keeps what is on screen under an hour old', () => {
    // Served at most revalidate + refresh old, and replaced after another refresh period.
    expect(SERVER_REVALIDATE_SECONDS * 1000 + 2 * PAGE_REFRESH_MS).toBeLessThan(60 * MINUTE);
    expect(SERVER_EXPIRE_SECONDS).toBeLessThanOrEqual(3600);
    expect(SERVER_EXPIRE_SECONDS).toBeGreaterThan(SERVER_REVALIDATE_SECONDS);
  });

  it('reloads an idle page once the refresh period has passed, and only once', () => {
    const { host } = fakeHost();
    scheduleRefresh(host, PAGE_REFRESH_MS, IDLE_MS);
    vi.advanceTimersByTime(PAGE_REFRESH_MS - MINUTE);
    expect(host.reloads).toBe(0);
    vi.advanceTimersByTime(2 * MINUTE);
    expect(host.reloads).toBe(1);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(host.reloads).toBe(1);
  });

  it('waits while the reader is active, then reloads once they are idle', () => {
    const { host, input } = fakeHost();
    scheduleRefresh(host, PAGE_REFRESH_MS, IDLE_MS);
    for (let m = 0; m < 30; m++) {
      vi.advanceTimersByTime(MINUTE);
      input();
    }
    expect(host.reloads).toBe(0);
    vi.advanceTimersByTime(IDLE_MS + MINUTE);
    expect(host.reloads).toBe(1);
  });

  it('reloads a hidden tab at once when it is due, even with recent input', () => {
    const { host, input, visibility } = fakeHost();
    scheduleRefresh(host, PAGE_REFRESH_MS, IDLE_MS);
    for (let m = 0; m < 21; m++) {
      input();
      vi.advanceTimersByTime(MINUTE);
    }
    input();
    visibility.get('visibilitychange')!();
    expect(host.reloads).toBe(0);
    host.document.visibilityState = 'hidden';
    visibility.get('visibilitychange')!();
    expect(host.reloads).toBe(1);
  });

  it('boots from static text that runs on its own', () => {
    const script = refreshBootScript();
    expect(script).toContain(`${PAGE_REFRESH_MS},${IDLE_MS}`);
    expect(script).not.toMatch(/WATCHMAN_SNAPSHOT_DIR|process\.env/);
    const { host } = fakeHost();
    new Function('window', script)(host);
    vi.advanceTimersByTime(PAGE_REFRESH_MS + MINUTE);
    expect(host.reloads).toBe(1);
  });
});
