import { describe, expect, it } from 'vitest';
import { parseSnapshot } from './index';

/**
 * Every committed fixture must be synthetic and valid. Beyond the schema, this guards the public
 * repository: links only to the reserved example.com domain, and nothing shaped like an email
 * address or a token.
 */
// Vite (Vitest) resolves import.meta.glob at test time. Core has no Vite types and declares none
// globally — production core code must not be able to call it — so the one call is typed here.
type Glob = (
  pattern: string,
  options: { eager: true; import: 'default' },
) => Record<string, unknown>;
const fixtures = (import.meta as unknown as { glob: Glob }).glob('../fixtures/synthetic/*.json', {
  eager: true,
  import: 'default',
});
const entries = Object.entries(fixtures);

function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node !== null && typeof node === 'object') return Object.values(node).flatMap(strings);
  return [];
}

describe('synthetic fixtures', () => {
  it('exist', () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  describe.each(entries)('%s', (_file, json) => {
    it('is marked synthetic', () => {
      expect((json as { synthetic?: unknown }).synthetic).toBe(true);
    });

    it('validates against the Snapshot schema', () => {
      const result = parseSnapshot(json);
      expect(result.ok ? [] : result.issues).toEqual([]);
    });

    it('links only to example.com', () => {
      const links = strings(json).filter((s) => s.includes('://') || /^[a-z]+:[^\s]/i.test(s));
      for (const value of links) {
        expect(value).toMatch(/^https:\/\/([a-z0-9-]+\.)*example\.com(\/|$)/);
      }
    });

    it('carries nothing shaped like an email address or a token', () => {
      for (const value of strings(json)) {
        expect(value).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
        expect(value).not.toMatch(/\b(ghp_|gho_|github_pat_|sk-|xox[abprs]-)/);
      }
    });
  });
});
