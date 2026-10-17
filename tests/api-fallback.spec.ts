import { expect, test } from '@playwright/test';

// AniList can block the shared Cloudflare addresses the deployed Function sends from (403,
// reported to the page as 502). The site then runs the same API code in the visitor's browser.
// Here the server side is faked as blocked and AniList is stubbed.
const media = (id: number, name: string) => ({
  id,
  idMal: id + 1000,
  title: { romaji: name, english: name, native: name },
  type: 'ANIME',
  format: 'TV',
  status: 'RELEASING',
  countryOfOrigin: 'JP',
  tags: [],
  startDate: { year: 2026 },
  season: 'FALL',
  seasonYear: 2026,
  popularity: 1000,
  averageScore: 80,
  episodes: 12,
  chapters: null,
  genres: ['Action'],
  synonyms: [],
  description: 'A story.',
  bannerImage: null,
  coverImage: {
    large: 'https://example.test/c.jpg',
    extraLarge: 'https://example.test/c.jpg',
    color: '#aabbcc',
  },
  trailer: null,
});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

test('a blocked server falls back to the visitor’s browser', async ({ page }) => {
  let fromBrowser = 0;
  await page.route(/graphql\.anilist\.co/, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { ...cors, 'access-control-allow-methods': 'POST' },
      });
    fromBrowser++;
    const list = Array.from({ length: 6 }, (_, i) => media(500 + i, `Fallback show ${i + 1}`));
    return route.fulfill({
      headers: cors,
      json: {
        data: { Page: { pageInfo: { currentPage: 1, hasNextPage: false, total: 6 }, media: list } },
      },
    });
  });
  let blocked = 0;
  await page.route(/\/api\/(browse|discover|highlights|search|awards)/, (route) => {
    blocked++;
    return route.fulfill({
      status: 502,
      json: { error: 'AniList is blocking this server. Trying from your browser…' },
    });
  });
  await page.goto('/browse');
  await expect(page.getByText('Fallback show 1', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(blocked).toBeGreaterThan(0);
  expect(fromBrowser).toBeGreaterThan(0);
});

test('Hype is never retried in the browser', async ({ page }) => {
  let fromBrowser = 0;
  await page.route(/graphql\.anilist\.co/, (route) => {
    fromBrowser++;
    return route.abort();
  });
  await page.route('**/api/hype*', (route) =>
    route.fulfill({ status: 502, json: { error: 'down' } }),
  );
  await page.goto('/rules');
  const status = await page.evaluate(async () => (await fetch('/api/hype?format=Anime')).status);
  expect(status).toBe(502);
  expect(fromBrowser).toBe(0);
});
