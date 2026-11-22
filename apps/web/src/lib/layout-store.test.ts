// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_STORAGE_KEY, LAYOUT_STYLE_ID, moveTile, defaultLayout } from './layout';
import {
  applyStoredLayoutCss,
  getStoredLayout,
  resetLayout,
  saveLayout,
  subscribeLayout,
} from './layout-store';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.getElementById(LAYOUT_STYLE_ID)?.remove();
});

const styleText = () => document.getElementById(LAYOUT_STYLE_ID)?.textContent ?? null;

describe('layout store', () => {
  it('saves, reflects the layout as CSS, notifies, and resets', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeLayout(onChange);
    expect(getStoredLayout()).toBeNull();

    expect(saveLayout(moveTile(defaultLayout(), 'spend', -2))).toBe(true);
    expect(JSON.parse(getStoredLayout()!)).toMatchObject({
      order: ['spend', 'attention', 'flow', 'metrics'],
    });
    expect(styleText()).toContain('[data-tile-slot="spend"]>*{order:0}');
    expect(onChange).toHaveBeenCalledTimes(1);

    resetLayout();
    expect(getStoredLayout()).toBeNull();
    expect(styleText()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    saveLayout(defaultLayout());
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('follows a change made in another tab', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeLayout(onChange);
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{"order":["metrics"],"hidden":[]}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: LAYOUT_STORAGE_KEY }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(styleText()).toContain('[data-tile-slot="metrics"]>*{order:0}');
    unsubscribe();
  });

  it('rewrites an existing style element rather than adding another', () => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{"order":["flow"]}');
    applyStoredLayoutCss();
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{"order":["spend"]}');
    applyStoredLayoutCss();
    expect(document.querySelectorAll(`#${LAYOUT_STYLE_ID}`)).toHaveLength(1);
    expect(styleText()).toContain('[data-tile-slot="spend"]>*{order:0}');
  });

  it('survives storage that throws: nothing read, nothing saved', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    } as unknown as Storage);
    expect(getStoredLayout()).toBeNull();
    expect(saveLayout(defaultLayout())).toBe(false);
    expect(() => resetLayout()).not.toThrow();
  });
});
