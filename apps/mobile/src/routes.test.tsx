// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttentionScreen } from './components/AttentionScreen';
import { COLORS } from './theme';

// The route files in `src/app` (tested from here: every file in that directory is a route). The
// navigator and the status bar are native views, so they are stood in by recorders: what is
// checked is the wiring the layout hands them, not React Navigation itself.
const seen = vi.hoisted(() => ({ stack: [] as unknown[], statusBar: [] as unknown[] }));

vi.mock('expo-router', () => ({
  Stack: (props: { screenOptions: unknown; children?: ReactNode }) => {
    seen.stack.push(props.screenOptions);
    return null;
  },
}));
vi.mock('expo-status-bar', () => ({
  StatusBar: (props: { style: string }) => {
    seen.statusBar.push(props.style);
    return null;
  },
}));

afterEach(cleanup);

describe('src/app', () => {
  it('index binds the home route to the Attention screen and draws nothing itself', async () => {
    const { default: Index } = await import('./app/index');
    expect(Index).toBe(AttentionScreen);
  });

  it('_layout is one headerless stack on the canvas colour, under a light status bar', async () => {
    const { default: RootLayout } = await import('./app/_layout');
    render(<RootLayout />);
    expect(seen.statusBar).toEqual(['light']);
    expect(seen.stack).toEqual([
      { headerShown: false, contentStyle: { backgroundColor: COLORS.canvas } },
    ]);
  });
});
