import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { formats, releaseStatuses } from '@animepoodle/shared';
import { getMediaDetails, CatalogError } from './anilist.js';
import { searchCatalog, getSupplementalMedia, discoverCatalog } from './catalog-service.js';
export const app = new Hono();
app.use('/api/*', cors({ origin: 'http://localhost:3000' }));
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
app.notFound((c) => c.json({ error: 'Not found' }, 404));
