// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react';
import { act, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_STORAGE_KEY, LAYOUT_STYLE_ID } from '@/lib/layout';
import { system } from '@/theme/system';
import { TileBoard, type BoardTile } from './TileBoard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tiles: BoardTile[] = (['attention', 'flow', 'spend', 'metrics'] as const).map((id) => ({
  id,
  title: id[0]!.toUpperCase() + id.slice(1),
  node: <article data-testid={id}>{id}</article>,
}));

let container: HTMLDivElement;
let root: Root | null = null;

const app = (): ReactElement => (
  <ChakraProvider value={system}>
    <TileBoard tiles={tiles} />
  </ChakraProvider>
);

/** Server-renders the board, then hydrates it, as a page load does. */
async function load(): Promise<string[]> {
  const errors: unknown[] = [];
  container = document.createElement('div');
  container.innerHTML = renderToString(app());
  document.body.appendChild(container);
  await act(async () => {
    root = hydrateRoot(container, app(), { onRecoverableError: (e) => errors.push(e) });
  });
  return errors.map(String);
}

const slots = () =>
  [...container.querySelectorAll('[data-tile-slot]')].map((e) => e.getAttribute('data-tile-slot'));
const button = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
  )!;
const status = () => container.querySelector('[role="status"]')!.textContent;
const click = (el: HTMLElement) => act(async () => el.click());

beforeEach(() => window.localStorage.clear());

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  document.getElementById(LAYOUT_STYLE_ID)?.remove();
  vi.restoreAllMocks();
});

describe('TileBoard', () => {
  it('server-renders the default order and hydrates without a mismatch', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ order: ['metrics', 'spend'], hidden: ['flow'] }),
    );
    expect(renderToString(app())).toMatch(/attention[\s\S]*flow[\s\S]*spend[\s\S]*metrics/);
    expect(await load()).toEqual([]);
    // After mount the DOM follows the saved layout; the hidden tile leaves the DOM.
    expect(slots()).toEqual(['metrics', 'spend', 'attention']);
  });

  it('shows, hides, reorders and resets, saving each change and announcing it', async () => {
    await load();
    await click(button('Customise tiles'));
    expect(button('Done customising').getAttribute('aria-expanded')).toBe('true');
    expect(button('Move Attention up').disabled).toBe(true);
    expect(button('Reset layout').disabled).toBe(true);

    const checkboxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes.every((c) => c.checked)).toBe(true);
    await click(checkboxes[3]!);
    expect(status()).toBe('Metrics hidden');
    expect(slots()).toEqual(['attention', 'flow', 'spend']);

    await click(button('Move Spend up'));
    expect(status()).toBe('Spend moved to position 2');
    expect(document.activeElement).toBe(button('Move Spend up'));
    await click(button('Move Spend up'));
    expect(status()).toBe('Spend moved to position 1');
    // At the top its up button is disabled, so focus moves to its partner.
    expect(document.activeElement).toBe(button('Move Spend down'));
    await click(button('Move Attention down'));
    expect(status()).toBe('Attention moved to position 3');
    expect(slots()).toEqual(['spend', 'flow', 'attention']);
    expect(JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY)!)).toEqual({
      order: ['spend', 'flow', 'attention', 'metrics'],
      hidden: ['metrics'],
    });

    const metricsBox = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((c) => !c.checked)!;
    await click(metricsBox);
    expect(status()).toBe('Metrics shown');

    await click(button('Reset layout'));
    expect(status()).toBe('Layout reset to the default');
    expect(slots()).toEqual(['attention', 'flow', 'spend', 'metrics']);
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();

    await click(button('Done customising'));
    expect(button('Customise tiles').getAttribute('aria-expanded')).toBe('false');
  });

  it('says so when every tile is hidden', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['attention', 'flow', 'spend', 'metrics'] }),
    );
    await load();
    expect(slots()).toEqual([]);
    expect(container.textContent).toContain('Every tile is hidden');
  });

  it('keeps working, unsaved, when storage refuses writes', async () => {
    await load();
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    } as unknown as Storage);
    await click(button('Customise tiles'));
    await click(button('Move Flow up'));
    expect(status()).toBe('Flow moved to position 1. Not saved: this browser blocks storage.');
  });
});
