import { describe, expect, it, vi } from 'vitest';
import { LINK_FAILED_MESSAGE, openLink } from './open-link';

describe('openLink', () => {
  it('opens an https link through the opener, once, with that exact url', async () => {
    const opener = vi.fn().mockResolvedValue(true);
    await expect(openLink('https://example.com/a/1', opener)).resolves.toBe('opened');
    expect(opener).toHaveBeenCalledTimes(1);
    expect(opener).toHaveBeenCalledWith('https://example.com/a/1');
  });

  it('reports failed when the opener rejects, and never throws', async () => {
    const opener = vi.fn().mockRejectedValue(new Error('no handler'));
    await expect(openLink('https://example.com/a/1', opener)).resolves.toBe('failed');
  });

  it.each(['http://example.com/', 'javascript:alert(1)', 'data:text/html,x', 'example.com', ''])(
    'refuses %j without calling the opener',
    async (url) => {
      const opener = vi.fn().mockResolvedValue(true);
      await expect(openLink(url, opener)).resolves.toBe('failed');
      expect(opener).not.toHaveBeenCalled();
    },
  );

  it('has a plain failure message', () => {
    expect(LINK_FAILED_MESSAGE).toBe('Could not open that link.');
  });
});
