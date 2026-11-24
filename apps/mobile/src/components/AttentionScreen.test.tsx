// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { afterEach, describe, expect, it } from 'vitest';
import { tileLabel } from '../lib/attention-view';
import { loadAttentionTile } from '../lib/load-attention';
import { AttentionScreen } from './AttentionScreen';

// Expo Router wraps every screen in a SafeAreaProvider; the test does the same with fixed metrics.
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

afterEach(cleanup);

describe('AttentionScreen', () => {
  it('draws the pivot header as a heading over the Attention tile from the bundled fixture', () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AttentionScreen />
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('heading', { name: 'attention' })).toBeDefined();
    expect(screen.getByText('watchman')).toBeDefined();
    const tile = screen.getByRole('region', { name: tileLabel(loadAttentionTile()) });
    expect(within(tile).getAllByRole('link')).toHaveLength(5);
  });
});
