import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * The P1 acceptance criteria, checked in a real browser against the production build with the
 * synthetic fixture. Screenshots land in e2e/.results (git-ignored) unless EVIDENCE_DIR is set.
 */

const fixture = JSON.parse(
  // Playwright loads this spec as CommonJS (apps/web is not "type": "module").
  readFileSync(join(__dirname, '../../../packages/core/fixtures/synthetic/full.json'), 'utf8'),
) as { attention: { candidates: { id: string; url: string }[] } };
const fixtureUrls = new Set(fixture.attention.candidates.map((c) => c.url));
const evidenceDir = process.env.EVIDENCE_DIR ?? 'e2e/.results';

/** Waits for the entrance animations, so a screenshot shows every tile at rest. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

/** Collects console errors and page errors, so a hydration mismatch fails the test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const tileTitles = (page: Page) =>
  page.locator('[data-tile-slot]').evaluateAll((slots) =>
    slots
      .filter((s) => getComputedStyle(s).display !== 'none')
      // The tile, not the inline <style> Emotion puts beside it before hydration; and layout
      // offsets, not client rects, because the entrance animation transforms the tiles.
      .map((s) => s.querySelector<HTMLElement>(':scope > :not(style)')!)
      .map((tile) => ({
        id: tile.parentElement!.getAttribute('data-tile-slot'),
        top: tile.offsetTop,
        left: tile.offsetLeft,
      }))
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((s) => s.id),
  );

test.beforeEach(async ({ context }) => {
  // Deep links point at example.com; answer them locally so the test needs no network.
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>deep link target</title><h1>ok</h1>' }),
  );
});

test('home: four tiles, the synthetic badge and the page as-of stamp', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  for (const title of ['Attention', 'Flow', 'Spend', 'Metrics']) {
    await expect(
      page.getByRole('heading', { level: 2, name: new RegExp(`^${title}`) }),
    ).toBeVisible();
  }
  await expect(page.getByText('synthetic data', { exact: true })).toBeVisible();
  await expect(page.getByTestId('page-as-of')).toContainText('Data as of 2026-01-14 15:00 UTC');
  await expect(page.getByTestId('page-refreshed')).toContainText('updates within the hour');
  expect(errors).toEqual([]);
});

test('every Attention item opens its deep link', async ({ page }) => {
  await page.goto('/');
  const links = page.locator('[data-tile-slot="attention"] [data-part="body"] a');
  await expect(links).toHaveCount(5);
  const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  for (const href of hrefs) {
    expect(href.startsWith('https://')).toBe(true);
    expect(fixtureUrls.has(href)).toBe(true);
  }
  for (const [i, href] of hrefs.entries()) {
    await page.goto('/');
    await page.locator('[data-tile-slot="attention"] [data-part="body"] a').nth(i).click();
    await expect(page).toHaveURL(href);
  }
  // The drill-down lists every eligible item, each with its link too.
  await page.goto('/attention');
  const all = page.locator('[data-attention-item] a');
  await expect(all).toHaveCount(6);
  for (const href of await all.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
    expect(fixtureUrls.has(href)).toBe(true);
  }
});

test('each tile opens its drill-down, and the drill-down leads back', async ({ page }) => {
  for (const [title, path, heading] of [
    ['Attention', '/attention', 'attention'],
    ['Flow', '/flow', 'flow'],
    ['Spend', '/spend', 'spend'],
    ['Metrics', '/metrics', 'metrics'],
  ] as const) {
    await page.goto('/');
    await page.getByRole('link', { name: `${title} details` }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: heading, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('link', { name: 'Back to start' }).click();
    await expect(page).toHaveURL('/');
  }
});

for (const width of [390, 1440]) {
  test(`no horizontal scrolling at ${width}px, with screenshots`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const path of ['/', '/attention', '/flow', '/spend', '/metrics']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
      await settle(page);
      const name = path === '/' ? 'home' : path.slice(1);
      await page.screenshot({ path: `${evidenceDir}/${name}-${width}.png`, fullPage: true });
    }
  });
}

test('layout customisation by keyboard persists across reload, with no flash and no mismatch', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  expect(await tileTitles(page)).toEqual(['attention', 'flow', 'spend', 'metrics']);

  // Keyboard only: open the panel, hide Metrics, move Spend up twice.
  await page.getByRole('button', { name: 'Customise tiles' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Show Metrics' }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Move Spend up' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Spend moved to position 2');
  // Focus stays on the moved row's button, so a second press keeps moving it.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Spend moved to position 1');
  expect(await tileTitles(page)).toEqual(['spend', 'attention', 'flow']);

  await page.reload();
  // Before any script runs past the inline boot one, the saved layout is already on screen.
  expect(await tileTitles(page)).toEqual(['spend', 'attention', 'flow']);
  // On this Next.js (16.4) build React hydrates on the first interaction; the first Tab (onto
  // the skip link, before any tile) is that interaction. From then on the DOM order follows the
  // layout, so reading and tab order match the screen by the time focus reaches a tile.
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      page
        .locator('[data-tile-slot]')
        .evaluateAll((s) => s.map((e) => e.getAttribute('data-tile-slot'))),
    )
    .toEqual(['spend', 'attention', 'flow']);
  await settle(page);
  await page.screenshot({ path: `${evidenceDir}/home-customised-1440.png`, fullPage: true });

  // No flash: with every script but the inline boot one blocked, the server HTML alone already
  // paints the saved layout.
  const raw = await page.context().newPage();
  await raw.route('**/_next/static/**/*.js', (route) => route.abort());
  await raw.goto('/');
  expect(await tileTitles(raw)).toEqual(['spend', 'attention', 'flow']);
  await raw.close();

  // Reset brings the default back, and it persists too.
  await page.getByRole('button', { name: 'Customise tiles' }).click();
  await page.getByRole('button', { name: 'Reset layout' }).click();
  expect(await tileTitles(page)).toEqual(['attention', 'flow', 'spend', 'metrics']);
  await page.reload();
  expect(await tileTitles(page)).toEqual(['attention', 'flow', 'spend', 'metrics']);
  expect(errors).toEqual([]);
});

test('the served page carries the idle-aware self-refresh', async ({ page }) => {
  // Its timing is proved in src/lib/refresh.test.ts, which runs this same script text under fake
  // timers; Playwright's fake clock stalls the Next.js runtime, so here the check is that the
  // production page ships it, with the 20-minute period and 2-minute idle wait.
  const response = await page.goto('/');
  const html = (await response?.text()) ?? '';
  expect(html).toContain('location.reload()');
  expect(html).toMatch(/\(window,1200000,120000\)/);
});

test('the focus ring on a tile title is visible inside the tile', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Attention details' });
  await link.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await link.evaluate((a) => {
    const after = getComputedStyle(a, '::after');
    return { style: after.outlineStyle, width: after.outlineWidth, offset: after.outlineOffset };
  });
  expect(ring).toEqual({ style: 'solid', width: '3px', offset: '-6px' });
  await settle(page);
  const tile = page.locator('[data-tile-slot="attention"] > :not(style)');
  await tile.screenshot({ path: `${evidenceDir}/focus-ring-attention.png` });
});

test('home view timing on the production build', async ({ page }) => {
  // A cold browser context, the first load of `/` after a warm-up request to the server.
  await page.request.get('/');
  const runs: { ttfb: number; dcl: number; load: number; lcp: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const context = await page.context().browser()!.newContext();
    const fresh = await context.newPage();
    await fresh.goto('/', { waitUntil: 'load' });
    runs.push(
      await fresh.evaluate(
        () =>
          new Promise<{ ttfb: number; dcl: number; load: number; lcp: number }>((resolve) => {
            const nav = performance.getEntriesByType(
              'navigation',
            )[0] as PerformanceNavigationTiming;
            new PerformanceObserver((list) => {
              const entries = list.getEntries();
              resolve({
                ttfb: Math.round(nav.responseStart),
                dcl: Math.round(nav.domContentLoadedEventEnd),
                load: Math.round(nav.loadEventEnd),
                lcp: Math.round(entries[entries.length - 1]!.startTime),
              });
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          }),
      ),
    );
    await context.close();
  }
  console.log(`home timing (ms) ${JSON.stringify(runs)}`);
  for (const run of runs) {
    expect(run.load).toBeLessThan(2000);
    expect(run.lcp).toBeLessThan(2000);
  }
});
