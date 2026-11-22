import type { SectionKey, Snapshot, SourceStatusRecord } from './snapshot';

/**
 * The sources that feed `section` but failed or had no data when the snapshot was built, as its
 * `sources` record says. A section with such a gap may be incomplete even when it holds values,
 * so every surface shows these beside the section. A `no_data` section whose reason is the
 * source's own is not repeated as a gap. Hand-made snapshots carry no `sources`: no gaps.
 */
export function sourceGaps(snapshot: Snapshot, section: SectionKey): SourceStatusRecord[] {
  const record = snapshot[section];
  return (snapshot.sources ?? []).filter(
    (s) =>
      s.status !== 'value' &&
      s.feeds.includes(section) &&
      !(record.state === 'no_data' && s.reason === record.reason),
  );
}
