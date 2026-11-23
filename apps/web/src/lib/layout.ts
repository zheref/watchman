/**
 * The home view's tile layout: which of the four tiles show, in what order. Single-user v1, so it
 * lives in the browser's `localStorage` under {@link LAYOUT_STORAGE_KEY}.
 *
 * {@link readLayout} and {@link layoutCss} are deliberately self-contained (no imports, no outer
 * references): the boot script in the root layout embeds their source text, so the stored layout
 * is applied as CSS before the first paint and the same code parses it after hydration.
 */

export const TILE_IDS = ['attention', 'flow', 'spend', 'metrics'] as const;
export type TileId = (typeof TILE_IDS)[number];

export const LAYOUT_STORAGE_KEY = 'watchman.layout.v1';

/** The id of the `<style>` element the boot script and the store write the layout into. */
export const LAYOUT_STYLE_ID = 'watchman-layout';

/** The attribute each tile slot on the home grid carries: `data-tile-slot="flow"`. */
export const TILE_SLOT_ATTRIBUTE = 'data-tile-slot';

export interface Layout {
  /** Every tile id exactly once, in display order. */
  order: string[];
  /** Ids of hidden tiles. */
  hidden: string[];
}

/**
 * Parses a stored layout. Anything unreadable gives the default (every tile, in `ids` order);
 * unknown ids are dropped, duplicates kept once, and tiles the stored value does not name (a
 * tile added later) are appended in their default position order. Never throws.
 */
export function readLayout(raw: string | null | undefined, ids: readonly string[]): Layout {
  let order: string[] = [];
  let hidden: string[] = [];
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value !== null && typeof value === 'object') {
      const v = value as { order?: unknown; hidden?: unknown };
      const pick = (list: unknown): string[] =>
        Array.isArray(list)
          ? list.filter(
              (id, i): id is string =>
                typeof id === 'string' && ids.indexOf(id) !== -1 && list.indexOf(id) === i,
            )
          : [];
      order = pick(v.order);
      hidden = pick(v.hidden);
    }
  } catch {
    order = [];
    hidden = [];
  }
  for (const id of ids) if (order.indexOf(id) === -1) order.push(id);
  return { order, hidden };
}

/**
 * The CSS that shows `layout` on the grid. Each tile sits in a `display: contents` slot, so the
 * slot's child is the grid item: it gets the `order`, and a hidden slot gets `display: none`
 * (important, to win over the slot's own `display: contents` class).
 */
export function layoutCss(layout: Layout, attribute: string): string {
  return layout.order
    .map(
      (id, i) =>
        `[${attribute}="${id}"]>*{order:${i}}` +
        (layout.hidden.indexOf(id) === -1 ? '' : `[${attribute}="${id}"]{display:none!important}`),
    )
    .join('');
}

export function defaultLayout(): Layout {
  return { order: [...TILE_IDS], hidden: [] };
}

export function isDefaultLayout(layout: Layout): boolean {
  return layout.hidden.length === 0 && layout.order.every((id, i) => id === TILE_IDS[i]);
}

/** `layout` with `id` moved by `delta` places (clamped to the ends). */
export function moveTile(layout: Layout, id: string, delta: number): Layout {
  const from = layout.order.indexOf(id);
  if (from === -1) return layout;
  const to = Math.max(0, Math.min(layout.order.length - 1, from + delta));
  if (to === from) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

/** `layout` with `id` shown or hidden. */
export function setTileHidden(layout: Layout, id: string, hide: boolean): Layout {
  const hidden = layout.hidden.filter((h) => h !== id);
  return { ...layout, hidden: hide ? [...hidden, id] : hidden };
}

export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ order: layout.order, hidden: layout.hidden });
}

/**
 * The inline script the root layout puts in `<head>`: it reads the stored layout and writes the
 * CSS that shows it, before the body is parsed, so a customised home never paints the default
 * order first. Storage that throws (private mode, blocked cookies) leaves the default.
 */
export function layoutBootScript(): string {
  const args = [
    JSON.stringify(LAYOUT_STORAGE_KEY),
    JSON.stringify(TILE_IDS),
    JSON.stringify(LAYOUT_STYLE_ID),
    JSON.stringify(TILE_SLOT_ATTRIBUTE),
  ].join(',');
  return `(function(readLayout,layoutCss,key,ids,styleId,attr){try{var raw=window.localStorage.getItem(key);if(!raw)return;var style=document.createElement('style');style.id=styleId;style.textContent=layoutCss(readLayout(raw,ids),attr);document.head.appendChild(style);}catch(e){}})(${readLayout.toString()},${layoutCss.toString()},${args});`;
}
