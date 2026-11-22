import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttentionItemView, AttentionTileView, StampView } from '../lib/attention-view';
import { tileLabel } from '../lib/attention-view';
import { COLORS, FONT, MIN_TARGET, SPACE, TYPE } from '../theme';

/** "synthetic-board · as of 2026-01-14 14:30 UTC · manual entry": the stamp every figure carries. */
function stampText(stamp: StampView): string {
  return `${stamp.source} · as of ${stamp.asOfLabel}${stamp.manual ? ' · manual entry' : ''}`;
}

function Badge({ children }: { children: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText} maxFontSizeMultiplier={1.4}>
        {children}
      </Text>
    </View>
  );
}

function Row({ item, onOpen }: { item: AttentionItemView; onOpen: (url: string) => void }) {
  return (
    <Pressable
      role="link"
      aria-label={item.accessibilityLabel}
      accessibilityHint={`Opens ${item.host} in your browser`}
      onPress={() => onOpen(item.url)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rank} aria-hidden>
        {item.rank}
      </Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowMeta}>
          {`${item.kindLabel} · ${item.project} · waiting ${item.waited}`}
        </Text>
        <Text style={styles.rowStamp}>{stampText(item.stamp)}</Text>
        <Text style={styles.rowHost}>{`opens ${item.host} ›`}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The Attention tile: a flat cobalt block, square corners, a big light figure, then the ranked
 * items. Each row is a link to where the owner acts on it; the footer stamps the tile with every
 * source behind it and the oldest as-of. With no data the tile turns neutral grey, says "No data"
 * and gives the reason; it never shows a zero or placeholder instead.
 */
export function AttentionTile({ view }: { view: AttentionTileView }) {
  const [failed, setFailed] = useState(false);
  const open = useCallback((url: string) => {
    setFailed(false);
    Linking.openURL(url).catch(() => setFailed(true));
  }, []);

  const missing = view.state === 'no_data';
  return (
    <View
      role="region"
      aria-label={tileLabel(view)}
      style={[styles.tile, { backgroundColor: missing ? COLORS.noData : COLORS.cobalt }]}
    >
      <View style={styles.header}>
        <Text role="heading" aria-level={2} style={styles.title}>
          Attention
        </Text>
        {view.synthetic ? <Badge>synthetic</Badge> : null}
        {view.state === 'value' && view.stamp.manual ? <Badge>manual</Badge> : null}
      </View>

      {view.state === 'no_data' ? (
        <View>
          <Text style={styles.figure} maxFontSizeMultiplier={1.2}>
            No data
          </Text>
          <Text style={styles.caption}>{view.reason}</Text>
        </View>
      ) : (
        <View>
          <Text
            style={styles.figure}
            maxFontSizeMultiplier={1.2}
            aria-label={`${view.waiting} waiting`}
          >
            {view.waiting}
          </Text>
          <Text style={styles.caption}>{view.caption}</Text>
          <View role="list" style={styles.list}>
            {view.items.map((item) => (
              <View key={item.id} role="listitem" style={styles.listItem}>
                <Row item={item} onOpen={open} />
              </View>
            ))}
          </View>
        </View>
      )}

      {failed ? (
        <Text role="alert" style={styles.failure}>
          Could not open that link.
        </Text>
      ) : null}

      {view.stamp === null ? null : <Text style={styles.footer}>{stampText(view.stamp)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Square corners, flat colour: no radius, no shadow, no gradient.
  tile: { padding: SPACE.lg, gap: SPACE.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  title: { color: COLORS.fg, fontSize: TYPE.title, letterSpacing: 0.4, ...FONT.semibold },
  badge: { borderWidth: 1, borderColor: COLORS.fg, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: {
    color: COLORS.fg,
    fontSize: TYPE.small,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...FONT.semibold,
  },
  figure: { color: COLORS.fg, fontSize: TYPE.figure, lineHeight: TYPE.figure * 1.1, ...FONT.light },
  caption: { color: COLORS.fg, fontSize: TYPE.caption, ...FONT.regular },
  list: { marginTop: SPACE.md },
  listItem: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.rule },
  row: {
    flexDirection: 'row',
    gap: SPACE.md,
    minHeight: MIN_TARGET,
    paddingVertical: SPACE.md,
  },
  rowPressed: { backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  rank: { color: COLORS.fg, fontSize: TYPE.pivot * 0.75, width: 32, ...FONT.light },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: COLORS.fg, fontSize: TYPE.title, ...FONT.semibold },
  rowMeta: { color: COLORS.fg, fontSize: TYPE.meta, ...FONT.regular },
  rowStamp: { color: COLORS.fg, fontSize: TYPE.small, ...FONT.regular },
  rowHost: { color: COLORS.fg, fontSize: TYPE.small, ...FONT.semibold },
  failure: { color: COLORS.fg, fontSize: TYPE.meta, ...FONT.semibold },
  footer: { color: COLORS.fg, fontSize: TYPE.small, ...FONT.regular },
});
