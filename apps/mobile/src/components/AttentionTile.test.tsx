// @vitest-environment happy-dom
import { assertSnapshot } from '@watchman/core';
import empty from '@watchman/core/fixtures/synthetic/empty.json';
import manualOnly from '@watchman/core/fixtures/synthetic/manual-only.json';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AccessibilityInfo, Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attentionTile, attentionTileFromJson, tileLabel } from '../lib/attention-view';
import { loadAttentionTile } from '../lib/load-attention';
import { LINK_FAILED_MESSAGE } from '../lib/open-link';
import { COLORS } from '../theme';
import { AttentionTile } from './AttentionTile';

// The render lane: `react-native` is `react-native-web` here (apps/mobile/vitest.config.mts), so
// the tile's roles and labels reach the DOM and are queried as a screen reader would name them.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tile = () => screen.getByRole('region');

/** `#RRGGBB` as `[r, g, b]`. */
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The computed colour of each border side, as `[r, g, b, a]` numbers. */
const borderRgba = (el: HTMLElement) => {
  const style = getComputedStyle(el);
  return (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) =>
    (style.getPropertyValue(`border-${side.toLowerCase()}-color`).match(/[\d.]+/g) ?? []).map(
      Number,
    ),
  );
};

describe('the value state, from the bundled synthetic fixture', () => {
  const view = loadAttentionTile();
  if (view.state !== 'value') throw new Error('the bundled fixture has a value');

  it('names the tile for a screen reader and shows the headline figure', () => {
    render(<AttentionTile view={view} />);
    expect(screen.getByRole('region', { name: tileLabel(view) })).toBeDefined();
    const figure = screen.getByLabelText(`${view.waiting} waiting`);
    expect(figure.textContent).toBe(String(view.waiting));
    expect(within(tile()).getByText(view.caption)).toBeDefined();
    expect(within(tile()).queryByText('No data')).toBeNull();
  });

  it('lists the ranked items as links, each named with its title, source and as-of', () => {
    render(<AttentionTile view={view} />);
    const list = within(tile()).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(view.items.length);
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(
      view.items.map((i) => i.accessibilityLabel),
    );
    for (const item of view.items) {
      const link = screen.getByRole('link', { name: item.accessibilityLabel });
      expect(within(link).getByText(item.title)).toBeDefined();
      expect(within(link).getByText(`opens ${item.host} ›`)).toBeDefined();
      // The rank numeral is already in the row's name, so it is hidden from the screen reader.
      expect(within(link).getByText(String(item.rank)).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('wears the synthetic badge, not the manual one, and stamps the tile', () => {
    render(<AttentionTile view={view} />);
    expect(within(tile()).getByText('synthetic')).toBeDefined();
    expect(within(tile()).queryByText('manual')).toBeNull();
    expect(
      within(tile()).getByText(
        'synthetic + synthetic-board + synthetic-forge · as of 2026-01-14 14:30 UTC',
      ),
    ).toBeDefined();
  });

  it('draws a focus outline in the focus colour on the focused row only, and clears it on blur', () => {
    render(<AttentionTile view={view} />);
    const [first, second] = screen.getAllByRole('link');
    const focusRgba = [...hexRgb(COLORS.focus), 1];
    const transparent = [0, 0, 0, 0];
    expect(borderRgba(first!)).toEqual([transparent, transparent, transparent, transparent]);
    fireEvent.focus(first!);
    expect(borderRgba(first!)).toEqual([focusRgba, focusRgba, focusRgba, focusRgba]);
    expect(borderRgba(second!)).toEqual([transparent, transparent, transparent, transparent]);
    fireEvent.blur(first!);
    expect(borderRgba(first!)).toEqual([transparent, transparent, transparent, transparent]);
  });
});

describe('the "No data" state', () => {
  it('says "No data" with its reason and stamp, never a zero or a list', () => {
    const view = attentionTile(assertSnapshot(empty));
    if (view.state !== 'no_data') throw new Error('the empty fixture has no data');
    render(<AttentionTile view={view} />);
    expect(
      screen.getByRole('region', {
        name: 'Attention. No data: no attention source configured. Synthetic data.',
      }),
    ).toBeDefined();
    expect(within(tile()).getByText('No data')).toBeDefined();
    expect(within(tile()).getByText('no attention source configured')).toBeDefined();
    expect(within(tile()).getByText('synthetic · as of 2026-01-14 15:00 UTC')).toBeDefined();
    expect(within(tile()).queryByRole('list')).toBeNull();
    expect(within(tile()).queryByRole('link')).toBeNull();
    expect(within(tile()).queryByText('0')).toBeNull();
    expect(within(tile()).queryByText('manual')).toBeNull();
  });

  it('an unreadable snapshot has no stamp and no synthetic badge', () => {
    const view = attentionTileFromJson({ schema_version: 99 });
    render(<AttentionTile view={view} />);
    expect(
      screen.getByRole('region', { name: 'Attention. No data: the snapshot could not be read.' }),
    ).toBeDefined();
    expect(within(tile()).queryByText('synthetic')).toBeNull();
    expect(within(tile()).queryByText(/as of/)).toBeNull();
  });
});

describe('the manual state', () => {
  it('wears the manual badge and marks every hand-typed row and stamp', () => {
    const view = attentionTile(assertSnapshot(manualOnly));
    if (view.state !== 'value') throw new Error('the manual fixture has a value');
    render(<AttentionTile view={view} />);
    expect(within(tile()).getByText('manual')).toBeDefined();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(view.items.length);
    for (const link of links) {
      expect(link.getAttribute('aria-label')).toContain('entered by hand');
      expect(within(link).getByText(/· manual entry$/)).toBeDefined();
    }
    // The tile's own stamp: the source is literally "manual entry", and it is marked as typed in.
    expect(
      within(tile()).getAllByText('manual entry · as of 2026-01-13 12:00 UTC · manual entry'),
    ).toHaveLength(links.length + 1);
  });
});

describe('opening a link', () => {
  const view = loadAttentionTile();
  if (view.state !== 'value') throw new Error('the bundled fixture has a value');
  const first = view.items[0]!;

  /** Taps the first row and lets the opener's promise settle. */
  const tapFirst = () =>
    act(async () => {
      fireEvent.click(screen.getByRole('link', { name: first.accessibilityLabel }));
    });

  it('opens the row’s own link and shows no failure', async () => {
    const openURL = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<AttentionTile view={view} />);
    await tapFirst();
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(first.url);
    expect(screen.queryByText(LINK_FAILED_MESSAGE)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('link-failed: says so in an assertive live region and announces it', async () => {
    vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<AttentionTile view={view} />);
    await tapFirst();
    const message = within(tile()).getByText(LINK_FAILED_MESSAGE);
    expect(message.getAttribute('aria-live')).toBe('assertive');
    expect(announce).toHaveBeenCalledWith(LINK_FAILED_MESSAGE);
  });

  it('clears the failure when the next tap opens', async () => {
    const openURL = vi.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no handler'));
    render(<AttentionTile view={view} />);
    await tapFirst();
    expect(screen.getByText(LINK_FAILED_MESSAGE)).toBeDefined();
    openURL.mockResolvedValueOnce(undefined);
    await tapFirst();
    expect(screen.queryByText(LINK_FAILED_MESSAGE)).toBeNull();
    expect(openURL).toHaveBeenCalledTimes(2);
  });
});
