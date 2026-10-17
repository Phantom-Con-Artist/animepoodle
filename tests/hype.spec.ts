import { test, expect } from '@playwright/test';
import { catalog } from './fixtures/catalog';
import { randomUUID } from 'node:crypto';

const year = new Date().getUTCFullYear();
const day = new Date().toISOString().slice(0, 10);
const titles = catalog.map((item) => ({ ...item, year, popularity: 1000, trailer: null }));

test.beforeEach(async ({ context }) => {
  let spent = 0;
  const scores = new Map<string, number>();
  const receipts = new Map<string, unknown>();
  await context.route('**/api/hype?*', (route) => {
    const format = new URL(route.request().url()).searchParams.get('format');
    const entries = titles
      .filter((item) => item.format === format)
      .map((item) => ({ item, points: scores.get(`${format}:${item.anilistId}`) || 0 }))
      .sort((a, b) => b.points - a.points);
    return route.fulfill({
      json: {
        year,
        day,
        format,
        votingAvailable: true,
        siteKey: null,
        entries,
        mode: entries.some((entry) => entry.points) ? 'hype' : 'popular',
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  await context.route('**/api/hype/wallet', (route) =>
    route.fulfill({ json: { day, spent, remaining: 10 - spent } }),
  );
  await context.route('**/api/hype/vote', async (route) => {
    const body = route.request().postDataJSON();
    if (receipts.has(body.requestId)) return route.fulfill({ json: receipts.get(body.requestId) });
    if (spent >= 10)
      return route.fulfill({
        status: 409,
        json: { error: 'You have used today’s 10 Hype points.', day, spent, remaining: 0 },
      });
    spent++;
    const key = `${body.format}:${body.anilistId}`;
    const points = (scores.get(key) || 0) + 1;
    scores.set(key, points);
    const result = {
      day,
      spent,
      remaining: 10 - spent,
      requestId: body.requestId,
      anilistId: body.anilistId,
      format: body.format,
      points,
    };
    receipts.set(body.requestId, result);
    return route.fulfill({ json: result });
  });
  await context.route('**/api/genres', (route) =>
    route.fulfill({ json: { genres: ['Action', 'Fantasy'] } }),
  );
  await context.route('**/api/browse?*', (route) => {
    const format = new URL(route.request().url()).searchParams.get('format');
    return route.fulfill({
      json: {
        items: titles.filter((item) => item.format === format),
        pageInfo: { currentPage: 1, hasNextPage: false },
        source: 'AniList',
      },
    });
  });
});
const noOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('Hype starts with honest popularity seeds and preserves the theme on small screens', async ({
  page,
}) => {
  await page.goto('/hype');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('This year’s Hype');
  await expect(page.getByText('10 of 10 Hype left today')).toBeVisible();
  await expect(page.getByText(/Starting with popular anime/)).toBeVisible();
  await expect(page.locator('.hype-row').first().locator('.hype-score strong')).toHaveText('0');
  expect(await noOverflow(page)).toBe(true);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.screenshot({
    path: `test-results/hype-dark-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('ten daily points are shared across formats, persist on reload and update ranks', async ({
  page,
}) => {
  await page.goto('/hype');
  const frieren = page.locator('.hype-row').filter({ hasText: 'Frieren' });
  for (let i = 0; i < 3; i++) {
    await frieren.getByRole('button', { name: /^Hype / }).click();
    await expect(page.getByText(`${9 - i} of 10 Hype left today`)).toBeVisible();
  }
  await expect(frieren.locator('.hype-score strong')).toHaveText('3');
  await page.getByRole('button', { name: 'Manga Japan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manga Hype', exact: true })).toBeVisible();
  for (let i = 0; i < 7; i++) {
    await page
      .locator('.hype-row')
      .first()
      .getByRole('button', { name: /^Hype / })
      .click();
    await expect(page.getByText(`${6 - i} of 10 Hype left today`)).toBeVisible();
  }
  await expect(
    page
      .locator('.hype-row')
      .first()
      .getByRole('button', { name: /daily limit reached/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByText('0 of 10 Hype left today')).toBeVisible();
  await page.getByRole('button', { name: 'Anime Japan', exact: true }).click();
  await expect(
    page.locator('.hype-row').filter({ hasText: 'Frieren' }).locator('.hype-score strong'),
  ).toHaveText('3');
  expect(await noOverflow(page)).toBe(true);
});

test('Hype stays off grids and one point is sent once from the Hype page', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/hype')) calls.push(request.url());
  });
  await page.goto('/browse');
  await expect(page.locator('.title-card').first()).toBeVisible();
  await expect(page.locator('.title-card .hype-button')).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.goto('/hype');
  const button = page
    .locator('.hype-row')
    .first()
    .getByRole('button', { name: /^Hype / });
  await button.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(page.getByText('9 of 10 Hype left today')).toBeVisible();
  expect(calls.filter((url) => url.endsWith('/vote'))).toHaveLength(1);
});

test('failed requests keep local points and retry the same request identifier', async ({
  page,
  context,
}) => {
  const requestIds: string[] = [];
  await context.route('**/api/hype/vote', (route) => {
    requestIds.push(route.request().postDataJSON().requestId);
    return route.fulfill({ status: 503, json: { error: 'Hype is temporarily unavailable.' } });
  });
  await page.goto('/hype');
  const button = page
    .locator('.hype-row')
    .first()
    .getByRole('button', { name: /^Hype / });
  await button.click();
  await expect(page.getByText('Hype is temporarily unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText('10 of 10 Hype left today')).toBeVisible();
  await button.click();
  await expect.poll(() => requestIds.length).toBe(2);
  expect(requestIds[0]).toBe(requestIds[1]);
});

test('a second tab shares the wallet and yesterday’s allowance resets', async ({
  page,
  context,
}) => {
  await page.addInitScript((id) => {
    localStorage.setItem('animepoodle-hype-voter', id);
    localStorage.setItem(
      'animepoodle-hype-wallet',
      JSON.stringify({ day: '2000-01-01', spent: 10, remaining: 0 }),
    );
  }, randomUUID());
  await page.goto('/hype');
  await expect(page.getByText('10 of 10 Hype left today')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/hype');
  await page
    .locator('.hype-row')
    .first()
    .getByRole('button', { name: /^Hype / })
    .click();
  await expect(other.getByText('9 of 10 Hype left today')).toBeVisible();
});

test('bot verification loads only when requested and precedes the vote', async ({
  page,
  context,
}) => {
  let scriptLoads = 0;
  let votes = 0;
  await context.route('**/api/hype?*', async (route) => {
    const response = await route.fallback();
    return response;
  });
  await context.route('**/api/hype?*', (route) =>
    route.fulfill({
      json: {
        year,
        day,
        format: 'Anime',
        votingAvailable: true,
        siteKey: 'public-site-key',
        mode: 'popular',
        entries: [{ item: titles[0], points: 0 }],
      },
    }),
  );
  await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*', (route) => {
    scriptLoads++;
    return route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {render(el, options) { const button = document.createElement('button'); button.textContent = 'Verify for Hype'; button.onclick = () => options.callback('verified-token'); el.appendChild(button); return 'widget'; }, remove() {}};`,
    });
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/api/hype/vote')) {
      votes++;
      expect(request.postDataJSON().turnstileToken).toBe('verified-token');
    }
  });
  await page.goto('/hype');
  expect(scriptLoads).toBe(0);
  await page
    .locator('.hype-row')
    .first()
    .getByRole('button', { name: /^Hype / })
    .click();
  await expect(page.getByRole('button', { name: 'Verify for Hype', exact: true })).toBeVisible();
  expect(votes).toBe(0);
  await page.getByRole('button', { name: 'Verify for Hype', exact: true }).click();
  await expect(page.getByText('9 of 10 Hype left today')).toBeVisible();
  expect(scriptLoads).toBe(1);
  expect(votes).toBe(1);
});
