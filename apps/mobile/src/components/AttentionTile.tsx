import { useCallback, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttentionItemView, AttentionTileView, StampView } from '../lib/attention-view';
import { tileLabel } from '../lib/attention-view';
import { LINK_FAILED_MESSAGE, openLink } from '../lib/open-link';
import { COLORS, FONT, LINE, MIN_TARGET, SPACE, TRACK, TYPE, lineHeight } from '../theme';

/** "synthetic-board · as of 2026-01-14 14:30 UTC · manual entry": the stamp every figure carries. */
function stampText(stamp: StampView): string {
  return `${stamp.source} · as of ${stamp.asOfLabel}${stamp.manual ? ' · manual entry' : ''}`;
}

function Badge({ children }: { children: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText} maxFontSizeMultiplier={2}>
        {children}
      </Text>
    </View>
  );
}

function Row({ item, onOpen }: { item: AttentionItemView; onOpen: (url: string) => void }) {
  // Keyboard, D-pad and switch focus: a visible outline, since the row has no background to light.
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      role="link"
      aria-label={item.accessibilityLabel}
      accessibilityHint={`Opens ${item.host} in your browser`}
      onPress={() => onOpen(item.url)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.row,
        focused && styles.rowFocused,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.rank} maxFontSizeMultiplier={1.2} aria-hidden>
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
    void openLink(url, (target) => Linking.openURL(target)).then((result) => {
      if (result === 'opened') return;
      setFailed(true);
      // A message that mounts after a tap is not spoken by itself on iOS; say it.
      AccessibilityInfo.announceForAccessibility(LINK_FAILED_MESSAGE);
    });
  }, []);

  const missing = view.state === 'no_data';
  return (
    <View
      role="region"
      aria-label={tileLabel(view)}
      style={[styles.tile, { backgroundColor: missing ? COLORS.noData : COLORS.cobalt }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Attention</Text>
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
          {failed ? (
            <Text accessibilityLiveRegion="assertive" style={styles.failure}>
              {LINK_FAILED_MESSAGE}
            </Text>
          ) : null}
          <View role="list" style={styles.list}>
            {view.items.map((item) => (
              <View key={item.id} role="listitem" style={styles.listItem}>
                <Row item={item} onOpen={open} />
              </View>
            ))}
          </View>
        </View>
      )}

      {view.stamp === null ? null : <Text style={styles.footer}>{stampText(view.stamp)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Square corners, flat colour: no radius, no shadow, no gradient.
  tile: { padding: SPACE.lg, gap: SPACE.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  title: {
    color: COLORS.fg,
    fontSize: TYPE.body,
    lineHeight: lineHeight(TYPE.body),
    letterSpacing: TRACK.tight,
    ...FONT.semibold,
  },
  badge: {
    borderWidth: 1,
    borderColor: COLORS.fg,
    paddingHorizontal: SPACE.xs + SPACE.hair,
    paddingVertical: SPACE.hair,
  },
  badgeText: {
    color: COLORS.fg,
    fontSize: TYPE.small,
    letterSpacing: TRACK.wide,
    textTransform: 'uppercase',
    ...FONT.semibold,
  },
  figure: {
    color: COLORS.fg,
    fontSize: TYPE.figure,
    lineHeight: lineHeight(TYPE.figure, LINE.display),
    ...FONT.light,
  },
  caption: {
    color: COLORS.fg,
    fontSize: TYPE.body,
    lineHeight: lineHeight(TYPE.body),
    ...FONT.regular,
  },
  failure: {
    color: COLORS.fg,
    fontSize: TYPE.body,
    lineHeight: lineHeight(TYPE.body),
    marginTop: SPACE.sm,
    ...FONT.semibold,
  },
  list: { marginTop: SPACE.md },
  listItem: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.rule },
  row: {
    flexDirection: 'row',
    gap: SPACE.md,
    minHeight: MIN_TARGET,
    paddingVertical: SPACE.md,
    // A constant transparent border, so focus draws an outline without moving the content.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowFocused: { borderColor: COLORS.focus },
  rowPressed: { backgroundColor: COLORS.pressed },
  rank: { color: COLORS.fg, fontSize: TYPE.rank, minWidth: 36, ...FONT.light },
  rowBody: { flex: 1, gap: SPACE.hair },
  rowTitle: {
    color: COLORS.fg,
    fontSize: TYPE.body,
    lineHeight: lineHeight(TYPE.body),
    ...FONT.semibold,
  },
  rowMeta: {
    color: COLORS.fg,
    fontSize: TYPE.body,
    lineHeight: lineHeight(TYPE.body),
    ...FONT.regular,
  },
  rowStamp: {
    color: COLORS.fg,
    fontSize: TYPE.small,
    lineHeight: lineHeight(TYPE.small),
    ...FONT.regular,
  },
  rowHost: {
    color: COLORS.fg,
    fontSize: TYPE.small,
    lineHeight: lineHeight(TYPE.small),
    ...FONT.semibold,
  },
  footer: {
    color: COLORS.fg,
    fontSize: TYPE.small,
    lineHeight: lineHeight(TYPE.small),
    ...FONT.regular,
  },
});
