import type { AttentionCandidate, SnapshotInput, WorkItem } from '../snapshot';

/** Test-only builders: small, valid, obviously synthetic records. */

export const NOW = new Date('2026-01-14T15:00:00Z');
export const AS_OF = '2026-01-14T14:00:00Z';

export function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  return {
    id: 'c-1',
    kind: 'owner_decision',
    title: 'Sample decision',
    project: 'Project Alpha',
    url: 'https://example.com/alpha/1',
    value: 3,
    waiting_since: '2026-01-13T15:00:00Z',
    source: 'synthetic',
    as_of: AS_OF,
    ...overrides,
  };
}

export function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'w-1',
    project: 'Project Alpha',
    kind: 'pr',
    title: 'Sample item',
    url: 'https://example.com/alpha/pulls/1',
    opened_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-14T00:00:00Z',
    source: 'synthetic',
    as_of: AS_OF,
    ...overrides,
  };
}

const missing = (reason: string) => ({
  state: 'no_data' as const,
  reason,
  source: 'synthetic',
  as_of: AS_OF,
});

/** A minimal valid snapshot input with every section missing. */
export function emptySnapshot(): SnapshotInput {
  return {
    schema_version: 1,
    synthetic: true,
    generated_at: NOW.toISOString(),
    attention: missing('none'),
    flow: missing('none'),
    spend: missing('none'),
    metrics: missing('none'),
  };
}
