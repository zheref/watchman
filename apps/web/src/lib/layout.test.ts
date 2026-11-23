import { describe, expect, it } from 'vitest';
import {
  LAYOUT_STORAGE_KEY,
  LAYOUT_STYLE_ID,
  TILE_IDS,
  TILE_SLOT_ATTRIBUTE,
  defaultLayout,
  isDefaultLayout,
  layoutBootScript,
  layoutCss,
  moveTile,
  readLayout,
  serializeLayout,
  setTileHidden,
} from './layout';

describe('readLayout', () => {
  it('gives the default for nothing stored or anything unreadable', () => {
    for (const raw of [null, undefined, '', 'not json', '42', 'null', '"x"', '{"order":"flow"}']) {
      expect(readLayout(raw, TILE_IDS)).toEqual(defaultLayout());
    }
  });

  it('keeps known ids once, drops unknown ones and appends tiles the value does not name', () => {
    expect(
      readLayout(
        JSON.stringify({
          order: ['spend', 'nope', 'spend', 7, 'attention'],
          hidden: ['metrics', 'nope', 'metrics'],
        }),
        TILE_IDS,
      ),
    ).toEqual({ order: ['spend', 'attention', 'flow', 'metrics'], hidden: ['metrics'] });
  });

  it('round-trips a serialised layout', () => {
    const layout = { order: ['metrics', 'flow', 'spend', 'attention'], hidden: ['flow'] };
    expect(readLayout(serializeLayout(layout), TILE_IDS)).toEqual(layout);
  });
});

describe('layout edits', () => {
  it('moves a tile and clamps at the ends', () => {
    const start = defaultLayout();
    expect(moveTile(start, 'spend', -1).order).toEqual(['attention', 'spend', 'flow', 'metrics']);
    expect(moveTile(start, 'attention', -1)).toBe(start);
    expect(moveTile(start, 'metrics', 5)).toBe(start);
    expect(moveTile(start, 'flow', 9).order).toEqual(['attention', 'spend', 'metrics', 'flow']);
    expect(moveTile(start, 'unknown', 1)).toBe(start);
  });

  it('hides and shows a tile', () => {
    const hidden = setTileHidden(defaultLayout(), 'flow', true);
    expect(hidden.hidden).toEqual(['flow']);
    expect(setTileHidden(hidden, 'flow', true).hidden).toEqual(['flow']);
    expect(setTileHidden(hidden, 'flow', false).hidden).toEqual([]);
  });

  it('knows the default layout', () => {
    expect(isDefaultLayout(defaultLayout())).toBe(true);
    expect(isDefaultLayout(moveTile(defaultLayout(), 'flow', 1))).toBe(false);
    expect(isDefaultLayout(setTileHidden(defaultLayout(), 'flow', true))).toBe(false);
  });
});

describe('layoutCss', () => {
  it('orders each slot’s tile and hides hidden slots', () => {
    expect(layoutCss({ order: ['flow', 'attention'], hidden: ['attention'] }, 'data-s')).toBe(
      '[data-s="flow"]>*{order:0}[data-s="attention"]>*{order:1}' +
        '[data-s="attention"]{display:none!important}',
    );
  });
});

describe('layoutBootScript', () => {
  /** Runs the boot script against a fake storage and head, as the browser would. */
  function boot(stored: string | null, throws = false) {
    const appended: { id: string; textContent: string }[] = [];
    const window = {
      localStorage: {
        getItem: (key: string) => {
          if (throws) throw new Error('blocked');
          return key === LAYOUT_STORAGE_KEY ? stored : null;
        },
      },
    };
    const document = {
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (node: { id: string; textContent: string }) => appended.push(node) },
    };
    new Function('window', 'document', layoutBootScript())(window, document);
    return appended;
  }

  it('writes the saved layout as CSS before paint', () => {
    const [style] = boot(JSON.stringify({ order: ['spend'], hidden: ['metrics'] }));
    expect(style?.id).toBe(LAYOUT_STYLE_ID);
    expect(style?.textContent).toBe(
      layoutCss(
        { order: ['spend', 'attention', 'flow', 'metrics'], hidden: ['metrics'] },
        TILE_SLOT_ATTRIBUTE,
      ),
    );
  });

  it('does nothing with nothing saved, or when storage throws', () => {
    expect(boot(null)).toEqual([]);
    expect(boot('{}', true)).toEqual([]);
  });

  it('is static text: no data and no environment in it', () => {
    const script = layoutBootScript();
    expect(script).not.toMatch(/WATCHMAN_SNAPSHOT_DIR|process\.env|fetch\(/);
    expect(script).toContain(JSON.stringify(TILE_IDS));
  });
});
