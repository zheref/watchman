import { z } from 'zod';

/**
 * Provenance: where a figure came from and when it was true.
 *
 * The rule the whole model follows is that **no number exists outside an observed record**. Every
 * record that holds figures carries `source` and `as_of` beside them (so each number carries its
 * provenance through the record it lives in), and a record that could not be observed is an
 * explicit `no_data` record with a reason, never a zero or an invented value.
 */

/** An ISO 8601 date-time with an explicit offset (`Z` or `±hh:mm`), e.g. `2026-01-12T09:00:00Z`. */
export const isoDateTime = z.iso.datetime({ offset: true });

/**
 * A deep link the owner can open: `https` to a dotted host name only, so no `javascript:`,
 * `data:` or bare-host URL can slip in.
 */
export const deepLink = z.url({
  protocol: /^https$/,
  hostname: /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
});

const label = z.string().trim().min(1);

export const provenanceShape = {
  /** A short, human-readable name of the source, e.g. `github` or `file:snapshot.json`. */
  source: label,
  /** When the figures were true at the source (not when Watchman read them). */
  as_of: isoDateTime,
  /** Present and `true` when a person typed the figures in rather than a source reporting them. */
  manual: z.boolean().optional(),
};

/** The explicit "we do not know" state. It still says which source was asked and when. */
export const noDataSchema = z.strictObject({
  state: z.literal('no_data'),
  reason: label,
  source: label,
  as_of: isoDateTime,
});

export type NoData = z.infer<typeof noDataSchema>;

export interface Provenance {
  source: string;
  as_of: string;
  manual?: boolean;
}

/**
 * An observed record: either `{ state: 'value', source, as_of, manual?, ...fields }` or a
 * `no_data` record. Use it for every record that holds figures.
 */
export function observed<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('value'), ...provenanceShape, ...shape }),
    noDataSchema,
  ]);
}

/** Narrowing helper: true when an observed record holds a value. */
export function hasValue<T extends { state: string }>(
  record: T,
): record is Extract<T, { state: 'value' }> {
  return record.state === 'value';
}

/** Builds a `no_data` record. */
export function noData(reason: string, source: string, asOf: string): NoData {
  return { state: 'no_data', reason, source, as_of: asOf };
}
