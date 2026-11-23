import {
  LAYOUT_STORAGE_KEY,
  LAYOUT_STYLE_ID,
  TILE_IDS,
  TILE_SLOT_ATTRIBUTE,
  layoutCss,
  readLayout,
  serializeLayout,
  type Layout,
} from './layout';

/**
 * The browser side of the layout: `localStorage` as the one source of truth, a `<style>` element
 * that shows it, and a change subscription. Every function tolerates storage
 * that throws (private mode) and a missing `window` (the server), falling back to the default.
 */

const CHANGE_EVENT = 'watchman:layout';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The raw stored value, or `null`. */
export function getStoredLayout(): string | null {
  try {
    return storage()?.getItem(LAYOUT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Writes `layout` into the layout `<style>`, or removes it for `null` (the default). */
export function applyLayoutCss(layout: Layout | null): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(LAYOUT_STYLE_ID);
  if (layout === null) {
    style?.remove();
    return;
  }
  if (style === null) {
    style = document.createElement('style');
    style.id = LAYOUT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = layoutCss(layout, TILE_SLOT_ATTRIBUTE);
}

/** Rewrites the layout `<style>` from storage, so the CSS never disagrees with what is saved. */
export function applyStoredLayoutCss(): void {
  const raw = getStoredLayout();
  applyLayoutCss(raw === null ? null : readLayout(raw, TILE_IDS));
}

function notify(): void {
  applyStoredLayoutCss();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Saves `layout` and shows it. Returns false when storage refused it: the CSS still shows it, and
 * the caller keeps it in memory, so the change lasts this page only.
 */
export function saveLayout(layout: Layout): boolean {
  let saved = false;
  try {
    const store = storage();
    if (store !== null) {
      store.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout));
      saved = true;
    }
  } catch {
    saved = false;
  }
  if (saved) notify();
  else applyLayoutCss(layout);
  return saved;
}

/** Forgets the saved layout: the default comes back. */
export function resetLayout(): void {
  try {
    storage()?.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Nothing stored to forget.
  }
  notify();
}

/** Calls `onChange` when this tab or another one changes the layout. */
export function subscribeLayout(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LAYOUT_STORAGE_KEY) {
      applyStoredLayoutCss();
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
