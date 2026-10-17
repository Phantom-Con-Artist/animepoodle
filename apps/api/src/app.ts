import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { catalog, formats } from '@animepoodle/shared';
import { getMediaDetails, CatalogError } from './anilist.js';
import { searchCatalog, getSupplementalMedia } from './catalog-service.js';
export const app = new Hono();
app.use('/api/*', cors({ origin: 'http://localhost:3000' }));
app.get('/api/health', (c) => c.json({ ok: true, service: 'animepoodle-api' }));
app.get('/api/catalog', (c) => {
  const q = (c.req.query('q') || '').toLowerCase().slice(0, 100);
  const format = c.req.query('format');
  return c.json({
    items: catalog.filter(
      (item) =>
        (!format || format === 'All' || item.format === format) &&
        `${item.title} ${item.original} ${item.genres.join(' ')}`.toLowerCase().includes(q),
    ),
    source: 'curated',
  });
});
app.get('/api/search', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 100);
  const format = c.req.query('format') || 'All';
  if (q.length < 2) return c.json({ error: 'Enter at least two characters.' }, 400);
  if (!formats.includes(format as (typeof formats)[number]))
    return c.json({ error: 'Unknown format.' }, 400);
  try {
    return c.json(await searchCatalog(q, format, c.req.query('broaden') === '1'));
  } catch (error) {
    if (error instanceof CatalogError) {
      if (error.status === 429) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    return c.json(
      { error: 'Live search is unavailable right now. Your curated discoveries are still here.' },
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
