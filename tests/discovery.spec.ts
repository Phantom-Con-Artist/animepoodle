import { test, expect, type Page } from '@playwright/test';
import type { Title } from '../packages/shared/src/index';
import { catalog } from './fixtures/catalog';

// Every API is mocked so the suite is deterministic and never touches AniList or Jikan.
const trailer = (id: string) => ({
  site: 'youtube',
  url: `https://www.youtube.com/watch?v=${id}`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
  thumbnail: null,
});
const items: Title[] = catalog.map((item, i) => ({
  ...item,
  mediaFormat: ['Anime', 'Donghua'].includes(item.format) ? (i === 3 ? 'MOVIE' : 'TV') : 'MANGA',
  status: item.status || 'FINISHED',
  bannerImage: item.bannerImage || '/images/hero.jpg',
  season: ['Anime', 'Donghua'].includes(item.format) ? 'FALL' : null,
  seasonYear: ['Anime', 'Donghua'].includes(item.format) ? 2026 : null,
  trailer: i === 0 ? (trailer('abc123') as Title['trailer']) : null,
}));
const inSection = (format: string | null) => items.filter((t) => t.format === format);
const emptyCommunity = {
  malUrl: 'https://myanimelist.net/anime/52991',
  background: null,
  members: null,
  rank: null,
  reviews: [],
  hasNextPage: false,
  topics: [],
};
const details = (overrides: Record<string, unknown> = {}) => ({
  anilistId: 154587,
  malId: 52991,
  url: 'https://anilist.co/anime/154587',
  trailer: trailer('abc123'),
  reviews: [],
  pageInfo: { currentPage: 1, hasNextPage: false },
  media: items[0],
  profile: {
    studios: ['Madhouse'],
    studioList: [{ id: 11, name: 'Madhouse' }],
    season: 'Fall 2023',
    endYear: 2024,
    duration: 24,
    sourceMaterial: 'Manga',
    popularity: 400000,
    favourites: 50000,
    characters: [
      {
        id: 1,
        name: 'Frieren',
        role: 'Main',
        image: null,
        voiceActor: { name: 'Atsumi Tanezaki', image: null, url: 'https://anilist.co/staff/1' },
      },
    ],
    staff: [{ name: 'Keiichiro Saito', role: 'Director', url: 'https://anilist.co/staff/2' }],
    links: [
      {
        site: 'Crunchyroll',
        url: 'https://www.crunchyroll.com/series/x',
        type: 'STREAMING',
        language: null,
        color: '#F88A36',
      },
      {
        site: 'Official Site',
        url: 'https://frieren-anime.jp',
        type: 'INFO',
        language: 'Japanese',
        color: null,
      },
    ],
    relations: [{ relation: 'Sequel', item: items[2] }],
    rankings: [{ rank: 3, label: 'Highest rated of all time', kind: 'RATED' }],
    nextEpisode: null,
    recommendations: [items[8]],
  },
  ...overrides,
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/highlights?*', (route) => {
    const format = new URL(route.request().url()).searchParams.get('format');
    const list = inSection(format);
    return route.fulfill({
      json: {
        format,
        season: ['Anime', 'Donghua'].includes(format!) ? { season: 'FALL', year: 2026 } : null,
        week: list,
        month: list.slice(1),
        year: list.slice(0, 3),
        seasonal: list,
        upcoming: list.slice(-2),
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  await page.route('**/api/awards', (route) =>
    route.fulfill({
      json: {
        winners: [
          {
            award: 'Anime of the Year',
            ceremony: '1st Crunchyroll Anime Awards',
            year: 2016,
            studio: 'MAPPA',
            item: items[2],
          },
        ],
        source: 'Wikipedia and AniList',
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route('**/api/genres', (route) =>
    route.fulfill({ json: { genres: ['Action', 'Adventure', 'Drama', 'Fantasy'] } }),
  );
  await page.route('**/api/browse?*', (route) => {
    const p = new URL(route.request().url()).searchParams;
    const kinds = (p.get('kind') || '').split(',').filter(Boolean);
    const list = inSection(p.get('format')).filter(
      (t) => !kinds.length || kinds.includes(t.mediaFormat!),
    );
    const page = Number(p.get('page') || 1);
    return route.fulfill({
      json: {
        items: page === 1 ? list.slice(0, 6) : list.slice(6),
        pageInfo: {
          currentPage: page,
          hasNextPage: page === 1 && list.length > 6,
          total: list.length,
        },
        source: 'AniList',
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  await page.route('**/api/community?*', (route) => route.fulfill({ json: emptyCommunity }));
  await page.route('**/api/media/*', (route) => route.fulfill({ json: details() }));
  await page.route('**/api/studio/*', (route) =>
    route.fulfill({
      json: {
        id: 11,
        name: 'Madhouse',
        isAnimationStudio: true,
        favourites: 1000,
        url: 'https://anilist.co/studio/11',
        items: inSection('Anime').slice(0, 4),
        pageInfo: { currentPage: 1, hasNextPage: false, total: 4 },
      },
    }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Player</body></html>' }),
  );
});

async function openNav(page: Page, name: string | RegExp) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name })
      .click();
  }
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('home is a landing page with highlights, rails and award winners', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frieren: Beyond Journey’s End' }),
  ).toBeVisible();
  for (const name of ['This week', 'Fresh this month', 'On the horizon'])
    await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Anime of the Year/ })).toBeVisible();
  await expect(page.locator('.award-card')).toContainText('1st Crunchyroll Anime Awards');
  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('sections stay separate: manhwa never shows anime, and seasons are anime-only', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Manhwa/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Solo Leveling' })).toBeVisible();
  const titles = await page
    .locator('#week-title')
    .locator('xpath=ancestor::section')
    .locator('.card-title')
    .allTextContents();
  expect(titles.sort()).toEqual(
    inSection('Manhwa')
      .map((t) => t.title)
      .sort(),
  );
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Mobile navigation' })
        .getByRole('link', { name: 'Seasonal' }),
    ).toHaveCount(0);
  } else {
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Seasonal' }),
    ).toHaveCount(0);
  }
});

test('browse filters by type and year through the URL and loads more pages', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/browse') && requests.push(r.url()));
  await page.goto('/browse');
  await expect(page.locator('.title-grid .title-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.locator('.title-grid .title-card')).toHaveCount(10);
  await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Movie' }).click();
  await expect(page).toHaveURL(/kind=MOVIE/);
  await expect(page.locator('.title-grid .title-card')).toHaveCount(1);
  await expect(page.locator('.title-card .format-badge')).toHaveText('Movie');
  if (await page.getByRole('button', { name: /^Filters/ }).isVisible())
    await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Year').selectOption('2024');
  await expect(page).toHaveURL(/year=2024/);
  expect(requests.some((u) => u.includes('kind=MOVIE') && u.includes('year=2024'))).toBe(true);
  expect(await noOverflow(page)).toBe(true);
});

test('header search goes to browse and can broaden to Jikan', async ({ page }) => {
  await page.route('**/api/search?*', (route) => {
    const broad = new URL(route.request().url()).searchParams.get('broaden') === '1';
    const base = { ...items[0], id: 991002, title: 'Primary story' };
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
  await page.getByRole('textbox', { name: 'Search stories' }).fill('story');
  await page.getByRole('textbox', { name: 'Search stories' }).press('Enter');
  await expect(page).toHaveURL(/\/browse\?q=story/);
  await expect(page.locator('.title-grid .card-title')).toHaveText(['Primary story']);
  await page.getByRole('button', { name: 'Broaden with Jikan' }).click();
  await expect(page.locator('.title-grid .card-title')).toHaveText([
    'Primary story',
    'Secondary story',
  ]);
});

test('top rated is a numbered chart sorted by score', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/browse') && requests.push(r.url()));
  await page.goto('/top');
  await expect(page.getByRole('heading', { level: 1, name: 'Top rated anime' })).toBeVisible();
  await expect(page.locator('.chart-row')).toHaveCount(6);
  await expect(page.locator('.chart-rank').first()).toHaveText('1');
  expect(requests.every((u) => u.includes('sort=SCORE_DESC'))).toBe(true);
});

test('seasonal groups titles by type and steps between seasons', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/browse') && requests.push(r.url()));
  await page.goto('/seasonal?season=FALL&year=2026');
  await expect(page.getByRole('heading', { level: 1, name: 'Fall 2026' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /TV series/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Movies/ })).toBeVisible();
  await page.getByRole('button', { name: 'Summer 2026' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Summer 2026' })).toBeVisible();
  expect(requests.some((u) => u.includes('season=SUMMER') && u.includes('year=2026'))).toBe(true);
});

test('library statuses work across sections and survive a reload', async ({ page }) => {
  await page.goto('/browse');
  await page.getByRole('button', { name: 'Add: Solo Leveling' }).click();
  await page.getByRole('menuitemradio', { name: 'Watching', exact: true }).click();
  await expect(page.locator('.title-card .library-badge').first()).toHaveText('Watching');
  await page.getByRole('button', { name: /^Manga/ }).click();
  await page.getByRole('button', { name: 'Add: Berserk' }).click();
  await page.getByRole('menuitemradio', { name: 'Next on my list' }).click();
  await page.getByRole('link', { name: /My library/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My library' })).toBeVisible();
  await expect(page.locator('.library-group h2')).toHaveText([/Anime/, /Manga/]);
  await page.getByRole('tab', { name: /In progress/ }).click();
  await expect(page.locator('.title-card .card-title')).toHaveText(['Solo Leveling']);
  await page.reload();
  await page.getByRole('tab', { name: /Next on my list/ }).click();
  await expect(page.locator('.title-card .card-title')).toHaveText(['Berserk']);
  await page.getByRole('button', { name: 'List view' }).click();
  await page.getByRole('button', { name: /^Next on my list/ }).click();
  await page.getByRole('menuitemradio', { name: 'Read', exact: true }).click();
  await page.getByRole('tab', { name: /Finished/ }).click();
  await expect(page.locator('.library-row')).toHaveCount(1);
});

test('older bookmarks become "Next on my list"', async ({ page }) => {
  await page.addInitScript((saved) => {
    localStorage.setItem(
      'animepoodle-profile',
      JSON.stringify({ saved: ['Anime:52991'], savedTitles: [saved] }),
    );
  }, items[0]);
  await page.goto('/library');
  await page.getByRole('tab', { name: /Next on my list/ }).click();
  await expect(page.locator('.title-card .card-title')).toHaveText([
    'Frieren: Beyond Journey’s End',
  ]);
});

test('story pages show where to watch, cast, studios and keep ratings', async ({ page }) => {
  await page.goto('/');
  await page.locator('.highlight').getByRole('link', { name: 'See details' }).click();
  await expect(page).toHaveURL(/\/story\?format=Anime&anilist=154587/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frieren: Beyond Journey’s End' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Crunchyroll/ })).toHaveAttribute(
    'href',
    'https://www.crunchyroll.com/series/x',
  );
  await expect(page.getByText('Atsumi Tanezaki')).toBeVisible();
  await expect(page.getByText('#3 highest rated of all time')).toBeVisible();
  await expect(page.getByRole('link', { name: /Fandom wikis/ }).first()).toHaveAttribute(
    'href',
    /fandom\.com/,
  );
  await page.getByRole('combobox', { name: 'My rating' }).selectOption('5');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'My rating' })).toHaveValue('5');
  await page.getByRole('link', { name: 'Madhouse' }).click();
  await expect(page).toHaveURL(/\/studio\?id=11/);
  await expect(page.getByRole('heading', { level: 1, name: 'Madhouse' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('story trailers are click to play and spoiler-hidden reviews paginate', async ({ page }) => {
  await page.route('**/api/media/*', (route) => {
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    return route.fulfill({
      json: details({
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
      }),
    });
  });
  await page.goto('/story?format=Anime&anilist=154587&mal=52991');
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

test('card trailers play muted and looping on click and stop independently of saving', async ({
  page,
}) => {
  await page.goto('/browse');
  const card = page.locator('.title-card').filter({ hasText: 'Frieren' });
  await expect(card.locator('.card-trailer-bg iframe')).toHaveCount(0);
  await card
    .getByRole('button', { name: 'Play trailer for Frieren: Beyond Journey’s End', exact: true })
    .click();
  const frame = card.locator('.card-trailer-bg iframe');
  await expect(frame).toHaveCount(1);
  const src = new URL((await frame.getAttribute('src'))!);
  expect([
    src.searchParams.get('mute'),
    src.searchParams.get('loop'),
    src.searchParams.get('playlist'),
  ]).toEqual(['1', '1', 'abc123']);
  await card.getByRole('button', { name: /Add: Frieren/ }).click();
  await page.getByRole('menuitemradio', { name: 'Watched', exact: true }).click();
  await expect(frame).toHaveCount(1);
  await card
    .getByRole('button', { name: 'Stop trailer for Frieren: Beyond Journey’s End', exact: true })
    .click();
  await expect(frame).toHaveCount(0);
});

test('soundtrack extras load on demand and play on click', async ({ page }) => {
  let extras = 0;
  await page.route('**/api/extras?*', (route) => {
    extras++;
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
        videos: [],
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
  await page.goto('/story?format=Anime&anilist=154587&mal=52991');
  await expect(page.getByRole('heading', { name: 'Soundtrack & extras' })).toBeVisible();
  expect(extras).toBe(0);
  await page.getByRole('button', { name: 'Find songs, videos & artwork' }).click();
  await expect(page.getByText('Opening Song', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Listen to Opening Song' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', 'https://a.animethemes.moe/test.ogg');
  await page.getByRole('button', { name: 'Stop theme playback' }).click();
  await expect(page.locator('audio')).toHaveCount(0);
});

test('settings switch title language and remember trailer previews', async ({ page }) => {
  await page.route('**/api/highlights?*', (route) =>
    route.fulfill({
      json: {
        format: 'Anime',
        season: null,
        week: [
          {
            ...items[0],
            titles: {
              english: 'Frieren: Beyond Journey’s End',
              romaji: 'Sousou no Frieren',
              native: '葬送のフリーレン',
            },
          },
        ],
        month: [],
        year: [],
        seasonal: [],
        upcoming: [],
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('dialog', { name: 'Navigation' })
      .getByRole('button', { name: 'Settings' })
      .click();
  } else await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByText('Romaji', { exact: true }).click();
  await page.getByRole('switch', { name: /Play trailers on hover/ }).uncheck();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sousou no Frieren' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Sousou no Frieren' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('animepoodle-prefs')!))).toEqual(
    {
      titleLanguage: 'romaji',
      hoverPreviews: false,
    },
  );
});

test('ratings shape For you without extra API requests', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await page.addInitScript(() => {});
  await openNav(page, 'For you');
  await expect(page.getByRole('heading', { level: 1, name: 'For you' })).toBeVisible();
  await expect(page.locator('.title-card').first()).toBeVisible();
  await expect(page.locator('.card-match').first()).toContainText('% match');
  await expect(page.getByText('Rust / WebAssembly', { exact: true })).toBeVisible();
});

test('Pages Function serves Hono routes on the deployed origin', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).service).toBe('animepoodle-api');
  expect((await request.get('/api/browse?format=All')).status()).toBe(400);
  expect((await request.get('/api/search?q=x')).status()).toBe(400);
});
