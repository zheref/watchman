import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttentionTile } from '../components/AttentionTile';
import { loadAttentionTile } from '../lib/load-attention';
import { COLORS, FONT, SPACE, TYPE } from '../theme';

/**
 * The home screen: a pivot-style header (small app name over a big light title) and the Attention
 * tile. Read-only: the only action is opening an item's link where the owner acts on it.
 */
export default function HomeScreen() {
  const view = useMemo(() => loadAttentionTile(), []);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.app}>watchman</Text>
          <Text role="heading" aria-level={1} style={styles.pivot} maxFontSizeMultiplier={1.2}>
            attention
          </Text>
        </View>
        <AttentionTile view={view} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xl * 2 },
  app: {
    color: COLORS.fgMuted,
    fontSize: TYPE.small,
    letterSpacing: 2,
    textTransform: 'uppercase',
    ...FONT.semibold,
  },
  pivot: { color: COLORS.fg, fontSize: TYPE.pivot, ...FONT.light },
});
