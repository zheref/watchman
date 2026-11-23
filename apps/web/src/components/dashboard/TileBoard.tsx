'use client';

import { chakra } from '@chakra-ui/react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { TileGrid } from '@/components/metro';
import {
  TILE_IDS,
  TILE_SLOT_ATTRIBUTE,
  isDefaultLayout,
  moveTile,
  readLayout,
  serializeLayout,
  setTileHidden,
  type TileId,
} from '@/lib/layout';
import { getStoredLayout, resetLayout, saveLayout, subscribeLayout } from '@/lib/layout-store';

export interface BoardTile {
  id: TileId;
  title: string;
  node: ReactNode;
}

const buttonCss = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '11',
  minWidth: '11',
  px: '3',
  bg: 'transparent',
  color: 'fg',
  borderWidth: '2px',
  borderColor: 'fg',
  borderRadius: 'none',
  fontSize: 'sm',
  fontWeight: 'semibold',
  cursor: 'pointer',
  _hover: { bg: 'fg', color: 'bg' },
  _disabled: { opacity: 0.4, cursor: 'not-allowed', _hover: { bg: 'transparent', color: 'fg' } },
  _focusVisible: { outline: '3px solid', outlineColor: 'focusRing', outlineOffset: '2px' },
} as const;

/**
 * The home grid with the owner's saved layout applied, and the panel that changes it.
 *
 * No flash and no hydration mismatch: the root layout's boot script applies the saved layout as
 * CSS before the first paint; hydration renders the server's default order, then the board
 * re-renders in the saved order so the DOM — and with it the reading and focus order — matches
 * what is on screen. Hidden tiles leave the DOM.
 */
export function TileBoard({ tiles }: { tiles: BoardTile[] }) {
  // Hydration renders what the server rendered (nothing saved); once mounted the board reads the
  // saved layout, and follows every later change in this tab or another.
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setRaw(getStoredLayout());
    sync();
    return subscribeLayout(sync);
  }, []);
  // A change storage refused lives here, for this page only.
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const layout = useMemo(() => readLayout(unsaved ?? raw, TILE_IDS), [unsaved, raw]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  // The button to refocus after a move re-renders the panel: `<tile id>:up` or `:down`.
  const focusTarget = useRef<string | null>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const byId = new Map(tiles.map((t) => [t.id, t]));
  const ordered = layout.order.flatMap((id) => {
    const tile = byId.get(id as TileId);
    return tile === undefined ? [] : [tile];
  });
  const visible = ordered.filter((t) => !layout.hidden.includes(t.id));

  // A moved row's button keeps focus; if it is now disabled (at an end), its partner takes it.
  useEffect(() => {
    const key = focusTarget.current;
    if (key === null) return;
    focusTarget.current = null;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLButtonElement>(`[data-focus-key="${key}"]`);
    if (target !== null && target !== undefined && !target.disabled) target.focus();
    else {
      const [id] = key.split(':');
      panel?.querySelector<HTMLButtonElement>(`[data-focus-key^="${id}:"]:not(:disabled)`)?.focus();
    }
  }, [layout]);

  const commit = (next: typeof layout, announce: string) => {
    if (saveLayout(next)) {
      setUnsaved(null);
      setMessage(announce);
    } else {
      setUnsaved(serializeLayout(next));
      setMessage(`${announce}, for this page only: this browser does not allow saving it.`);
    }
  };

  return (
    <>
      <chakra.div display="flex" justifyContent="flex-end" mb="3">
        <chakra.button
          type="button"
          css={buttonCss}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Done customising' : 'Customise tiles'}
        </chakra.button>
      </chakra.div>

      <chakra.div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        role="region"
        aria-label="Customise tiles"
        mb="6"
        p="4"
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border"
      >
        <chakra.p m="0" mb="3" textStyle="metro.body">
          Show, hide and reorder the tiles. Saved in this browser only.
        </chakra.p>
        <chakra.ol listStyle="none" m="0" p="0" display="flex" flexDirection="column" gap="2">
          {ordered.map((tile, i) => {
            const hidden = layout.hidden.includes(tile.id);
            const checkboxId = `${panelId}-${tile.id}`;
            return (
              <chakra.li
                key={tile.id}
                display="flex"
                flexWrap="wrap"
                alignItems="center"
                gap="2"
                data-layout-row={tile.id}
              >
                <chakra.span minWidth="2ch" textStyle="metro.label" aria-hidden="true">
                  {i + 1}
                </chakra.span>
                <chakra.label
                  htmlFor={checkboxId}
                  display="inline-flex"
                  alignItems="center"
                  gap="2"
                  minHeight="11"
                  flex="1 1 10rem"
                  cursor="pointer"
                  textStyle="metro.body"
                >
                  <chakra.input
                    id={checkboxId}
                    type="checkbox"
                    checked={!hidden}
                    width="5"
                    height="5"
                    accentColor="var(--chakra-colors-tile-cobalt)"
                    onChange={(e) =>
                      commit(
                        setTileHidden(layout, tile.id, !e.currentTarget.checked),
                        `${tile.title} ${e.currentTarget.checked ? 'shown' : 'hidden'}`,
                      )
                    }
                  />
                  Show {tile.title}
                </chakra.label>
                <chakra.button
                  type="button"
                  css={buttonCss}
                  data-focus-key={`${tile.id}:up`}
                  aria-label={`Move ${tile.title} up`}
                  disabled={i === 0}
                  onClick={() => {
                    focusTarget.current = `${tile.id}:up`;
                    commit(moveTile(layout, tile.id, -1), `${tile.title} moved to position ${i}`);
                  }}
                >
                  ↑
                </chakra.button>
                <chakra.button
                  type="button"
                  css={buttonCss}
                  data-focus-key={`${tile.id}:down`}
                  aria-label={`Move ${tile.title} down`}
                  disabled={i === ordered.length - 1}
                  onClick={() => {
                    focusTarget.current = `${tile.id}:down`;
                    commit(
                      moveTile(layout, tile.id, 1),
                      `${tile.title} moved to position ${i + 2}`,
                    );
                  }}
                >
                  ↓
                </chakra.button>
              </chakra.li>
            );
          })}
        </chakra.ol>
        <chakra.div display="flex" flexWrap="wrap" alignItems="center" gap="3" mt="4">
          <chakra.button
            type="button"
            css={buttonCss}
            disabled={isDefaultLayout(layout)}
            onClick={() => {
              resetLayout();
              setUnsaved(null);
              setMessage('Layout reset to the default');
            }}
          >
            Reset layout
          </chakra.button>
        </chakra.div>
        <chakra.p
          role="status"
          aria-live="polite"
          m="0"
          mt="3"
          textStyle="metro.caption"
          minHeight="5"
        >
          {message}
        </chakra.p>
      </chakra.div>

      {visible.length === 0 ? (
        <chakra.p textStyle="metro.body" color="fg.muted">
          Every tile is hidden. Choose “Customise tiles” to show them again.
        </chakra.p>
      ) : null}
      <TileGrid label="Dashboard tiles">
        {visible.map((tile) => (
          <chakra.div key={tile.id} display="contents" {...{ [TILE_SLOT_ATTRIBUTE]: tile.id }}>
            {tile.node}
          </chakra.div>
        ))}
      </TileGrid>
    </>
  );
}
