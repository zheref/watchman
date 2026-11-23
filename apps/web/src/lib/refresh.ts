/**
 * Keeps an open dashboard fresh without anyone touching it. The server re-reads the snapshot in
 * the background once its cached read is older than {@link SERVER_REVALIDATE_SECONDS}, and never
 * serves one older than {@link SERVER_EXPIRE_SECONDS}; an open page reloads itself once
 * {@link PAGE_REFRESH_MS} has passed. While the page stays open its reloads keep the cache warm,
 * so a reload is served a read at most 15 + 20 = 35 minutes old, and nothing stays on screen
 * past 55 minutes. The reload waits until the tab is hidden or the reader has been idle for
 * {@link IDLE_MS}, so it never yanks a page out from under someone reading or typing (WCAG 2.2.1).
 *
 * {@link scheduleRefresh} is self-contained (no imports, no outer references): the root layout's
 * inline script embeds its source text, so it runs before, and without, React hydration.
 */

/** How long the server serves a cached page before re-reading the snapshot. */
export const SERVER_REVALIDATE_SECONDS = 900;
/** The oldest cached read the server will serve; past it the request waits for a fresh read. */
export const SERVER_EXPIRE_SECONDS = 3600;
/** How long an open page waits before reloading itself. */
export const PAGE_REFRESH_MS = 20 * 60 * 1000;
/** How long without input counts as idle. */
export const IDLE_MS = 2 * 60 * 1000;

/** The slice of `window` the refresher uses, so tests can pass a fake. */
export interface RefreshHost {
  addEventListener: (type: string, listener: () => void, options?: unknown) => void;
  setInterval: (handler: () => void, ms: number) => unknown;
  document: {
    visibilityState: string;
    addEventListener: (type: string, listener: () => void) => void;
  };
  location: { reload: () => void };
}

/**
 * Reloads `host` once `refreshMs` has passed since it loaded and either its document is hidden or
 * no input arrived for `idleMs`. Checks every minute and whenever visibility changes.
 */
export function scheduleRefresh(host: RefreshHost, refreshMs: number, idleMs: number): void {
  const loaded = Date.now();
  let lastInput = loaded;
  let reloading = false;
  const onInput = () => {
    lastInput = Date.now();
  };
  const events = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
  for (let i = 0; i < events.length; i++) {
    host.addEventListener(events[i]!, onInput, { capture: true, passive: true });
  }
  const check = () => {
    const now = Date.now();
    if (reloading || now - loaded < refreshMs) return;
    if (host.document.visibilityState === 'hidden' || now - lastInput >= idleMs) {
      reloading = true;
      host.location.reload();
    }
  };
  host.setInterval(check, 60 * 1000);
  host.document.addEventListener('visibilitychange', check);
}

/** The inline script the root layout puts in `<head>`. Static text: no data in it. */
export function refreshBootScript(): string {
  return `(${scheduleRefresh.toString()})(window,${PAGE_REFRESH_MS},${IDLE_MS});`;
}
