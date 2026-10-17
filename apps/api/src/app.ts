import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { formats, releaseStatuses, type Format } from '@animepoodle/shared';
import { getMediaDetails, CatalogError } from './anilist.js';
import { searchCatalog, getSupplementalMedia, discoverCatalog } from './catalog-service.js';
import { getJikanCommunity } from './jikan.js';
import {
  browseAniList,
  browseSorts,
  getAwards,
  getGenres,
  getHighlights,
  getStudio,
  validKinds,
  validSeason,
} from './browse.js';
import { hypeApp, type HypeBindings } from './hype';
import { readApp, setBlocklist, setPublicOrigin } from './mangadex.js';
export const app = new Hono<{ Bindings: HypeBindings }>();
app.use(
  '/api/*',
  cors({ origin: 'http://localhost:3000', allowHeaders: ['Content-Type', 'X-Hype-Voter'] }),
);
app.use('/api/*', async (c, next) => {
  setPublicOrigin(new URL(c.req.url).origin);
  const env = c.env as Record<string, string | undefined> | undefined;
  setBlocklist(
    env?.READ_BLOCKLIST ??
      (typeof process !== 'undefined' ? process.env.READ_BLOCKLIST : undefined),
  );
  await next();
});
app.route('/api/hype', hypeApp);
app.route('/api/read', readApp);
app.get('/api/health', (c) => c.json({ ok: true, service: 'animepoodle-api' }));
app.get('/api/catalog', (c) =>
  c.redirect(
    `/api/${c.req.query('q') ? 'search' : 'discover'}?${new URL(c.req.url).searchParams}`,
    307,
  ),
);
app.get('/api/discover', async (c) => {
  const format = c.req.query('format') || 'All';
  const status = c.req.query('status') || 'ALL';
  const sort = c.req.query('sort') || 'TRENDING_DESC';
  if (
    !formats.includes(format as (typeof formats)[number]) ||
    !releaseStatuses.includes(status as (typeof releaseStatuses)[number]) ||
    !['TRENDING_DESC', 'POPULARITY_DESC', 'SCORE_DESC', 'START_DATE_DESC'].includes(sort)
  )
    return c.json({ error: 'Invalid discovery filters.' }, 400);
  try {
    return c.json(await discoverCatalog(format, status, sort));
  } catch (error) {
    if (error instanceof CatalogError) {
      if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    return c.json({ error: 'The live catalog is unavailable right now.' }, 503);
  }
});
app.get('/api/search', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 100);
  const format = c.req.query('format') || 'All';
  const status = c.req.query('status') || 'ALL';
  if (!releaseStatuses.includes(status as (typeof releaseStatuses)[number]))
    return c.json({ error: 'Unknown release status.' }, 400);
  if (q.length < 2) return c.json({ error: 'Enter at least two characters.' }, 400);
  if (!formats.includes(format as (typeof formats)[number]))
    return c.json({ error: 'Unknown format.' }, 400);
  try {
    return c.json(await searchCatalog(q, format, c.req.query('broaden') === '1', status));
  } catch (error) {
    if (error instanceof CatalogError) {
      if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    return c.json(
      { error: 'Live search is unavailable right now. Your cached discoveries are still here.' },
      503,
    );
  }
});
app.get('/api/media/:id', async (c) => {
  const rawId = c.req.param('id');
  const id = Number(rawId);
  const format = c.req.query('format');
  const rawPage = c.req.query('page') || '1';
  const page = Number(rawPage);
  if (!/^-?[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id))
    return c.json({ error: 'Invalid media ID.' }, 400);
  if (!format || format === 'All' || !formats.includes(format as (typeof formats)[number]))
    return c.json({ error: 'Choose a story format.' }, 400);
  if (!/^\d+$/.test(rawPage) || !Number.isInteger(page) || page < 1 || page > 1000)
    return c.json({ error: 'Invalid review page.' }, 400);
  try {
    return c.json(await getMediaDetails(id, format, page));
  } catch (error) {
    if (error instanceof CatalogError) {
      if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    return c.json(
      { error: 'Trailers and reviews are unavailable right now. Please try again shortly.' },
      503,
    );
  }
});
app.get('/api/extras', async (c) => {
  const format = c.req.query('format');
  if (!format || format === 'All' || !formats.includes(format as (typeof formats)[number]))
    return c.json({ error: 'Choose a story format.' }, 400);
  const rawAni = c.req.query('anilistId');
  const rawMal = c.req.query('malId');
  const valid = (id: string | undefined) =>
    id === undefined ||
    (/^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) <= 2147483647);
  if ((!rawAni && !rawMal) || !valid(rawAni) || !valid(rawMal))
    return c.json({ error: 'Provide a valid AniList or MyAnimeList ID.' }, 400);
  return c.json(
    await getSupplementalMedia(
      rawAni ? Number(rawAni) : undefined,
      rawMal ? Number(rawMal) : undefined,
      format,
    ),
  );
});
app.get('/api/community', async (c) => {
  const format = c.req.query('format');
  if (!format || format === 'All' || !formats.includes(format as (typeof formats)[number]))
    return c.json({ error: 'Choose a story format.' }, 400);
  const rawMal = c.req.query('malId') || '';
  const rawPage = c.req.query('page') || '1';
  if (!/^[1-9]\d{0,9}$/.test(rawMal) || Number(rawMal) > 2147483647)
    return c.json({ error: 'Provide a valid MyAnimeList ID.' }, 400);
  if (!/^[1-9]\d{0,2}$/.test(rawPage)) return c.json({ error: 'Invalid review page.' }, 400);
  try {
    return c.json(
      await getJikanCommunity(
        Number(rawMal),
        ['Anime', 'Donghua'].includes(format),
        Number(rawPage),
      ),
    );
  } catch (error) {
    if (error instanceof CatalogError) {
      if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    return c.json({ error: 'MyAnimeList community data is unavailable right now.' }, 503);
  }
});
function fail(c: Context, error: unknown, fallback: string) {
  if (error instanceof CatalogError) {
    if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
    return c.json({ error: error.message }, error.status);
  }
  return c.json({ error: fallback }, 503);
}
const sectionFormat = (raw: string | undefined) =>
  raw && raw !== 'All' && formats.includes(raw as Format) ? (raw as Format) : null;
app.get('/api/browse', async (c) => {
  const format = sectionFormat(c.req.query('format'));
  if (!format) return c.json({ error: 'Choose a section.' }, 400);
  const kinds = (c.req.query('kind') || '').split(',').filter(Boolean);
  const genre = c.req.query('genre') || undefined;
  const rawYear = c.req.query('year');
  const season = c.req.query('season') || undefined;
  const status = c.req.query('status') || 'ALL';
  const sort = c.req.query('sort') || 'POPULARITY_DESC';
  const rawPage = c.req.query('page') || '1';
  const year = rawYear ? Number(rawYear) : undefined;
  if (
    kinds.length > 6 ||
    !validKinds(format, kinds) ||
    (genre !== undefined && !/^[A-Za-z -]{2,30}$/.test(genre)) ||
    (rawYear !== undefined && (!/^\d{4}$/.test(rawYear) || year! < 1940 || year! > 2100)) ||
    (season !== undefined && !validSeason(season)) ||
    !releaseStatuses.includes(status as (typeof releaseStatuses)[number]) ||
    !(browseSorts as readonly string[]).includes(sort) ||
    !/^[1-9]\d{0,2}$/.test(rawPage)
  )
    return c.json({ error: 'Invalid browse filters.' }, 400);
  try {
    return c.json(
      await browseAniList({
        format,
        kinds,
        genre,
        year,
        season,
        status: status === 'ALL' ? undefined : status,
        sort: sort as (typeof browseSorts)[number],
        page: Number(rawPage),
        // Top-rated lists ignore titles too obscure for their score to mean much.
        minPopularity:
          sort === 'SCORE_DESC' ? (['Anime'].includes(format) ? 3000 : 400) : undefined,
      }),
    );
  } catch (error) {
    return fail(c, error, 'Browsing is unavailable right now.');
  }
});
app.get('/api/highlights', async (c) => {
  const format = sectionFormat(c.req.query('format'));
  if (!format) return c.json({ error: 'Choose a section.' }, 400);
  try {
    return c.json(await getHighlights(format));
  } catch (error) {
    return fail(c, error, 'Highlights are unavailable right now.');
  }
});
app.get('/api/awards', async (c) => {
  try {
    return c.json(await getAwards());
  } catch (error) {
    return fail(c, error, 'Award winners are unavailable right now.');
  }
});
app.get('/api/genres', async (c) => {
  try {
    return c.json({ genres: await getGenres() });
  } catch (error) {
    return fail(c, error, 'Genres are unavailable right now.');
  }
});
app.get('/api/studio/:id', async (c) => {
  const rawId = c.req.param('id');
  const rawPage = c.req.query('page') || '1';
  const sort = c.req.query('sort') || 'START_DATE_DESC';
  if (
    !/^[1-9]\d{0,8}$/.test(rawId) ||
    !/^[1-9]\d{0,2}$/.test(rawPage) ||
    !['START_DATE_DESC', 'POPULARITY_DESC', 'SCORE_DESC'].includes(sort)
  )
    return c.json({ error: 'Invalid studio request.' }, 400);
  try {
    return c.json(await getStudio(Number(rawId), Number(rawPage), sort));
  } catch (error) {
    return fail(c, error, 'Studio details are unavailable right now.');
  }
});
app.notFound((c) => c.json({ error: 'Not found' }, 404));
