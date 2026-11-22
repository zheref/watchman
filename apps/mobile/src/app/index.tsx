import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttentionTile } from '../components/AttentionTile';
import { loadAttentionTile } from '../lib/load-attention';
import { COLORS, FONT, MAX_CONTENT_WIDTH, SPACE, TRACK, TYPE, LINE, lineHeight } from '../theme';

/**
 * The home screen: a pivot-style header (small app name over a big light title) and the Attention
 * tile. Read-only: the only action is opening an item's link where the owner acts on it.
 */
export default function HomeScreen() {
  const view = useMemo(() => loadAttentionTile(), []);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View>
            <Text style={styles.app}>watchman</Text>
            <Text role="heading" style={styles.pivot} maxFontSizeMultiplier={1.2}>
              attention
            </Text>
          </View>
          <AttentionTile view={view} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  scroll: { alignItems: 'center' },
  // A phone fills the width; a tablet keeps a readable column.
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, padding: SPACE.lg, gap: SPACE.lg },
  app: {
    color: COLORS.fgMuted,
    fontSize: TYPE.small,
    lineHeight: lineHeight(TYPE.small),
    letterSpacing: TRACK.wider,
    textTransform: 'uppercase',
    ...FONT.semibold,
  },
  pivot: {
    color: COLORS.fg,
    fontSize: TYPE.pivot,
    lineHeight: lineHeight(TYPE.pivot, LINE.display),
    ...FONT.light,
  },
});
