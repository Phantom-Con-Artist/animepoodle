import { test, expect } from '@playwright/test';
import { catalog } from './fixtures/catalog';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/discover?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const items = catalog
      .map((item) => ({
        ...item,
        status: item.status || 'FINISHED',
        bannerImage: item.bannerImage || '/images/hero.jpg',
      }))
      .filter(
        (item) =>
          (!params.get('format') ||
            params.get('format') === 'All' ||
            item.format === params.get('format')) &&
          (!params.get('status') ||
            params.get('status') === 'ALL' ||
            item.status === params.get('status')),
      );
    return route.fulfill({
      json: { items, source: 'AniList', fetchedAt: new Date().toISOString() },
    });
  });
});
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
  const filtered = await request.get('/api/discover?status=invalid');
  expect(filtered.status()).toBe(400);
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

test('soundtrack extras are on demand, attributed, and click to play', async ({ page }) => {
  let extrasRequests = 0;
  await page.route('**/api/media/*', (route) =>
    route.fulfill({
      json: {
        anilistId: 154587,
        malId: 52991,
        url: 'https://anilist.co/anime/154587',
        bannerImage: '/images/hero.jpg',
        youtubeLinks: [
          {
            label: 'Trailer on YouTube',
            url: 'https://www.youtube.com/watch?v=abc123',
            source: 'AniList',
          },
        ],
        trailer: null,
        reviews: [],
        pageInfo: { currentPage: 1, hasNextPage: false },
      },
    }),
  );
  await page.route('**/api/extras?*', (route) => {
    extrasRequests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('anilistId')).toBe('154587');
    expect(url.searchParams.get('malId')).toBe('52991');
    return route.fulfill({
      json: {
        themes: [
          {
            id: 'op1',
            label: 'OP1',
            title: 'Opening Song',
            artists: ['Artist'],
            videoUrl: 'https://v.animethemes.moe/test.webm',
            audioUrl: 'https://a.animethemes.moe/test.ogg',
            episodes: '1-12',
            source: 'AnimeThemes',
            url: 'https://animethemes.moe/anime/test',
          },
        ],
        videos: [
          {
            title: 'Music video',
            source: 'Jikan',
            trailer: {
              site: 'youtube',
              url: 'https://www.youtube.com/watch?v=music123',
              embedUrl: 'https://www.youtube-nocookie.com/embed/music123',
              thumbnail: null,
            },
          },
        ],
        artwork: [
          {
            url: '/images/frieren.jpg',
            thumbnail: '/images/frieren.jpg',
            label: 'Cover artwork',
            source: 'Jikan',
          },
        ],
        sources: [
          { name: 'AnimeThemes', status: 'ok' },
          { name: 'Jikan', status: 'ok' },
        ],
      },
    });
  });
  await page.route('https://a.animethemes.moe/**', (route) => route.abort());
  await page.route('https://v.animethemes.moe/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Meet your next favorite' }).click();
  await expect(page.getByRole('link', { name: 'Trailer on YouTube AniList' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=abc123',
  );
  expect(extrasRequests).toBe(0);
  await expect(page.locator('audio,video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find songs, videos & artwork' }).click();
  await expect(page.getByText('Opening Song', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Openings & endings' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/supplemental-${test.info().project.name}.png` });
  await expect(page.locator('audio,video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listen to Opening Song' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', 'https://a.animethemes.moe/test.ogg');
  await page.getByRole('button', { name: 'Stop theme playback' }).click();
  await expect(page.locator('audio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Watch Opening Song' }).click();
  await expect(page.locator('video')).toHaveAttribute('src', 'https://v.animethemes.moe/test.webm');
  await expect(page.getByRole('link', { name: 'Open artwork 2 from Jikan' })).toHaveAttribute(
    'href',
    '/images/frieren.jpg',
  );
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
test('broader search is opt-in and keeps AniList titles first', async ({ page }) => {
  const base = {
    id: 991002,
    title: 'Primary story',
    original: 'Primary',
    format: 'Anime',
    year: 2024,
    rating: 8,
    episodes: '12 episodes',
    genres: ['Fantasy'],
    description: 'Story',
    image: '/images/frieren.jpg',
    color: '#567456',
    features: [1, 0.5, 0.4, 0.4, 0.6, 1],
    source: 'AniList',
  };
  await page.route('**/api/search?*', (route) => {
    const broad = new URL(route.request().url()).searchParams.get('broaden') === '1';
    return route.fulfill({
      json: {
        items: broad
          ? [base, { ...base, id: 991003, title: 'Secondary story', source: 'Jikan' }]
          : [base],
        source: broad ? 'AniList + Jikan' : 'AniList',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search stories' }).fill('test');
  await page.getByRole('button', { name: 'Search all stories' }).click();
  await expect(page.locator('.title-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Broaden with Jikan' }).click();
  await expect(page.locator('.title-card')).toHaveCount(2);
  await expect(page.locator('.card-title').first()).toHaveText('Primary story');
});

test('private ratings persist and update recommendations without API requests', async ({
  page,
}) => {
  let apiCalls = 0;
  await page.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname === '/api/discover') return route.fallback();
    apiCalls++;
    return route.fulfill({
      json: {
        anilistId: 154587,
        url: 'https://anilist.co/anime/154587',
        trailer: null,
        reviews: [],
        pageInfo: { currentPage: 1, hasNextPage: false },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Meet your next favorite' }).click();
  await expect(page.getByRole('heading', { name: 'Soundtrack & extras' })).toBeVisible();
  const before = apiCalls;
  await page.getByRole('combobox', { name: 'My rating' }).selectOption('5');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('animepoodle-profile') || '{}').feedback?.[0]?.rating,
      ),
    )
    .toBe(5);
  expect(apiCalls).toBe(before);
  await page.reload();
  await page.getByRole('button', { name: 'Meet your next favorite' }).click();
  await expect(page.getByRole('combobox', { name: 'My rating' })).toHaveValue('5');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /For you/ })
    .click();
  await expect(page.getByRole('heading', { name: 'A shelf with your name on it' })).toBeVisible();
  await expect(
    page.locator('.title-card .card-title').filter({ hasText: 'Frieren: Beyond Journey’s End' }),
  ).toHaveCount(0);
});
test('discovered metadata is reused from IndexedDB after reload without another search', async ({
  page,
}) => {
  let searchCalls = 0;
  await page.route('**/api/search?*', (route) => {
    searchCalls++;
    return route.fulfill({
      json: {
        items: [
          {
            id: 991111,
            anilistId: 991112,
            malId: 991111,
            title: 'Remembered discovery',
            original: 'Remembered',
            format: 'Anime',
            year: 2024,
            rating: 8,
            episodes: '12 episodes',
            genres: ['Fantasy'],
            tags: [{ name: 'Time Travel', rank: 95 }],
            description: 'A discovery to keep on this device.',
            image: '/images/frieren.jpg',
            color: '#567456',
            features: [1, 0.5, 0.4, 0.4, 0.6, 1],
          },
        ],
        source: 'AniList',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search stories' }).fill('remembered');
  await page.getByRole('button', { name: 'Search all stories' }).click();
  await expect(
    page.getByRole('button', { name: 'Remembered discovery', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('animepoodle-local-catalog');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('titles', 'readonly');
              const read = tx.objectStore('titles').get('Anime:991111');
              read.onsuccess = () => {
                resolve(!!read.result);
                db.close();
              };
              read.onerror = () => reject(read.error);
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /For you/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Remembered discovery', exact: true }),
  ).toBeVisible();
  expect(searchCalls).toBe(1);
});

test('release filters fetch live upcoming titles instead of a bundled catalog', async ({
  page,
}) => {
  const statuses: string[] = [];
  await page.route('**/api/discover?*', async (route) => {
    const status = new URL(route.request().url()).searchParams.get('status')!;
    statuses.push(status);
    return route.fulfill({
      json: {
        items: [
          {
            ...catalog[0],
            id: 987651,
            anilistId: 987652,
            title: 'Live future discovery',
            year: 0,
            rating: 0,
            status: status === 'ALL' ? 'RELEASING' : status,
            tags: [{ name: 'Space Opera', rank: 98 }],
            source: 'AniList',
          },
        ],
        source: 'AniList',
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.title-card .card-title')).toHaveText('Live future discovery');
  await expect(page.locator('.title-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Release status' }).selectOption('NOT_YET_RELEASED');
  await expect(page.locator('.title-card .release-badge')).toHaveText('TBA / upcoming');
  await expect(page.locator('.title-card .card-meta')).toContainText('TBA');
  expect(statuses).toContain('NOT_YET_RELEASED');
});

test('SWR restores cached discovery while refreshing and keeps it on API failure', async ({
  page,
}) => {
  let mode: 'initial' | 'delayed' | 'failure' = 'initial';
  let release: (() => void) | undefined;
  let refreshes = 0;
  await page.route('**/api/discover?*', async (route) => {
    refreshes++;
    if (mode === 'delayed')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (mode === 'failure')
      return route.fulfill({ status: 503, json: { error: 'Provider offline' } });
    return route.fulfill({
      json: {
        items: [
          {
            ...catalog[0],
            title: mode === 'initial' ? 'Cached live story' : 'Updated live story',
            status: 'FINISHED',
          },
        ],
        source: 'AniList',
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.title-card .card-title')).toHaveText('Cached live story');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const req = indexedDB.open('animepoodle-local-catalog');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const db = req.result;
              const read = db.transaction('requests').objectStore('requests').count();
              read.onsuccess = () => {
                resolve(read.result);
                db.close();
              };
            };
          }),
      ),
    )
    .toBe(1);
  mode = 'delayed';
  await page.reload();
  await expect(page.locator('.title-card .card-title')).toHaveText('Cached live story');
  await expect.poll(() => !!release).toBe(true);
  release!();
  await expect(page.locator('.title-card .card-title')).toHaveText('Updated live story');
  mode = 'failure';
  await page.getByRole('button', { name: 'Check updates' }).click();
  await expect(page.getByText('Could not refresh. Showing cached discoveries.')).toBeVisible();
  await expect(page.locator('.title-card .card-title')).toHaveText('Updated live story');
  expect(refreshes).toBe(3);
});
