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

/** Query keys that usually carry a secret; a deep link carrying one would publish it in markup. */
const CREDENTIAL_QUERY_KEY =
  /[?&](?:token|access_token|id_token|refresh_token|api_key|apikey|key|sig|signature|auth|password|secret)=/i;

/**
 * A deep link the owner can open: `https` to a dotted host name only, so no `javascript:`,
 * `data:` or bare-host URL can slip in, and with no credentials in it — no `user:pass@` part and
 * no token-shaped query key — because the link is rendered into page markup and browser history.
 */
export const deepLink = z
  .url({
    protocol: /^https$/,
    hostname: /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
  })
  .refine((url) => !/^https:\/\/[^/?#]*@/i.test(url), {
    message: 'a deep link must not carry credentials (user:password@)',
  })
  .refine((url) => !CREDENTIAL_QUERY_KEY.test(url), {
    message: 'a deep link must not carry a token-shaped query parameter',
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

/**
 * The provenance of several records taken together: every source named once (sorted), the
 * **oldest** `as_of`, and `manual` when any part was typed in. A combined figure never claims
 * fresher or more automatic data than its stalest, most manual part.
 */
export function combineProvenance(records: readonly Provenance[]): Provenance {
  if (records.length === 0) throw new RangeError('combineProvenance needs at least one record');
  const sources = [...new Set(records.map((r) => r.source))].sort();
  let oldest = records[0]!.as_of;
  for (const r of records) if (Date.parse(r.as_of) < Date.parse(oldest)) oldest = r.as_of;
  const manual = records.some((r) => r.manual === true);
  return { source: sources.join(' + '), as_of: oldest, ...(manual ? { manual: true } : {}) };
}
