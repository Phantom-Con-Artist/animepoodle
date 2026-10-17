import { test, expect } from '@playwright/test';
test('discovery, format filters, and saved library survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your next obsession.' })).toBeVisible();
  await expect(page.locator('.title-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Manhwa KR', exact: true }).click();
  await expect(page.locator('.title-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Save Solo Leveling', exact: true }).click();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /My library/ })
    .click();
  await expect(page.locator('.title-card')).toHaveCount(1);
  await page.reload();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /My library/ })
    .click();
  await expect(page.locator('.title-card')).toHaveCount(1);
});
test('Rust engine loads in a worker and taste controls update recommendations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Find my story', exact: true }).click();
  await expect(page.getByText('Rust / WebAssembly', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Comfort', exact: false }).focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Show me my stories' }).click();
  await expect(page.getByRole('heading', { name: 'A shelf with your name on it' })).toBeVisible();
  await expect(page.locator('.card-match').first()).toContainText('% taste match');
  await page.getByRole('button', { name: /Comfort zone/ }).click();
  await expect(page.getByRole('status')).toBeVisible();
});
test('detail dialog and mobile layout are accessible without horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Meet your next favorite' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Frieren: Beyond Journey’s End' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect.poll(() => page.locator('.mini-card').count()).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const broken = await page
    .locator('.title-card img, .hero-art')
    .evaluateAll(
      (images) =>
        images.filter(
          (i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0,
        ).length,
    );
  expect(broken).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/discovery-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('search handles upstream errors and matches romanized AniList results', async ({ page }) => {
  await page.route('**/api/search?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 991001,
            title: 'A translated title',
            original: '原題',
            format: 'Anime',
            year: 2024,
            rating: 8,
            episodes: '12 episodes',
            genres: ['Fantasy'],
            description: 'A good story',
            image: '/images/frieren.jpg',
            color: '#567456',
            features: [1, 0.5, 0.4, 0.4, 0.6, 1],
          },
        ],
        source: 'AniList',
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search stories' }).fill('romanized');
  await page.getByRole('button', { name: 'Search all stories' }).click();
  await expect(page.getByRole('button', { name: 'A translated title', exact: true })).toBeVisible();
  await page.route('**/api/search?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'AniList is temporarily unavailable.' } }),
  );
  await page.getByRole('textbox', { name: 'Search stories' }).fill('another');
  await page.getByRole('button', { name: 'Search all stories' }).click();
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
});
test('Pages Function serves Hono routes on the deployed origin', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).service).toBe('animepoodle-api');
  const filtered = await request.get('/api/catalog?q=solo&format=Manhwa');
  expect((await filtered.json()).items).toHaveLength(1);
  const invalid = await request.get('/api/search?q=x');
  expect(invalid.status()).toBe(400);
});

test('trailers start only on click, loop behind cards, and stop independently of saving', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/media/*', (route) => {
    requests++;
    return route.fulfill({
      json: {
        anilistId: 154587,
        url: 'https://anilist.co/anime/154587',
        trailer: {
          site: 'youtube',
          url: 'https://www.youtube.com/watch?v=abc123',
          embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
          thumbnail: null,
        },
        reviews: [],
        pageInfo: { currentPage: 1, hasNextPage: false },
      },
    });
  });
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Player test</body></html>' }),
  );
  await page.goto('/');
  expect(requests).toBe(0);
  await expect(page.locator('.card-trailer-bg iframe')).toHaveCount(0);
  await page
    .locator('.title-card')
    .getByRole('button', { name: 'Play trailer for Frieren: Beyond Journey’s End', exact: true })
    .click();
  const frame = page.locator('.card-trailer-bg iframe');
  await expect(frame).toHaveCount(1);
  const src = new URL((await frame.getAttribute('src'))!);
  expect(src.searchParams.get('mute')).toBe('1');
  expect(src.searchParams.get('loop')).toBe('1');
  expect(src.searchParams.get('playlist')).toBe('abc123');
  expect(src.searchParams.get('autoplay')).toBe('1');
  await page
    .getByRole('button', { name: 'Save Frieren: Beyond Journey’s End', exact: true })
    .click();
  await expect(frame).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Stop trailer for Frieren: Beyond Journey’s End', exact: true })
    .click();
  await expect(frame).toHaveCount(0);
});
test('story trailers are click to play and spoiler-hidden reviews paginate', async ({ page }) => {
  await page.route('**/api/media/*', (route) => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    return route.fulfill({
      json: {
        anilistId: 154587,
        url: 'https://anilist.co/anime/154587',
        trailer: {
          site: 'youtube',
          url: 'https://www.youtube.com/watch?v=abc123',
          embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
          thumbnail: null,
        },
        reviews: [
          {
            id: second ? 2 : 1,
            author: second ? 'Second reader' : 'First reader',
            summary: 'A wonderful story with a surprising ending.',
            score: 85,
            helpful: 10,
            ratings: 12,
            url: 'https://anilist.co/review/1',
          },
        ],
        pageInfo: { currentPage: second ? 2 : 1, hasNextPage: !second },
      },
    });
  });
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Player test</body></html>' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Meet your next favorite' }).click();
  await expect(page.getByText('First reader', { exact: true })).toBeVisible();
  await expect(page.locator('.trailer-panel iframe')).toHaveCount(0);
  await expect(
    page.getByText('A wonderful story with a surprising ending.', { exact: true }),
  ).not.toBeVisible();
  await page.getByText('Reveal review summary', { exact: true }).click();
  await expect(
    page.getByText('A wonderful story with a surprising ending.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Play Frieren: Beyond Journey’s End trailer', exact: true })
    .click();
  await expect(page.locator('.trailer-panel iframe')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next reviews' }).click();
  await expect(page.getByText('Second reader', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
});
test('cards preserve cover artwork when a trailer is missing', async ({ page }) => {
  await page.route('**/api/media/*', (route) =>
    route.fulfill({
      json: {
        anilistId: 154587,
        url: 'https://anilist.co/anime/154587',
        trailer: null,
        reviews: [],
        pageInfo: { currentPage: 1, hasNextPage: false },
      },
    }),
  );
  await page.goto('/');
  await page
    .locator('.title-card')
    .getByRole('button', { name: 'Play trailer for Frieren: Beyond Journey’s End', exact: true })
    .click();
  await expect(
    page.locator('.title-card').getByRole('button', {
      name: 'No trailer available for Frieren: Beyond Journey’s End',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator('.card-trailer-bg iframe')).toHaveCount(0);
  await expect(page.locator('.title-card img').first()).toBeVisible();
});
