import { formatAsOf } from '@watchman/core';

export interface ProvenanceStamp {
  source: string;
  as_of: string;
  manual?: boolean;
}

/** "source · as of 2026-01-14 15:00 UTC · manual": the stamp every figure carries. */
export function Provenance({ source, as_of, manual }: ProvenanceStamp) {
  return (
    <>
      <span>{source}</span>
      {' · as of '}
      <time dateTime={as_of}>{formatAsOf(as_of)}</time>
      {manual === true ? ' · manual entry' : null}
    </>
  );
}
