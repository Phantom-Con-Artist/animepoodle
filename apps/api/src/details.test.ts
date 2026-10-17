import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
import { normalizeTrailer } from './anilist.js';
test('media endpoint validates IDs, formats, and pages without upstream access', async () => {
  for (const url of [
    '/api/media/0?format=Anime',
    '/api/media/1.5?format=Anime',
    '/api/media/123?format=All',
    '/api/media/123?format=Anime&page=0',
    '/api/media/123?format=Anime&page=2.5',
  ])
    assert.equal((await app.request(url)).status, 400);
});
test('trailer normalization only creates player URLs for supported sites and valid IDs', () => {
  assert.equal(normalizeTrailer(null), null);
  assert.equal(normalizeTrailer({ id: '../evil', site: 'youtube' }), null);
  assert.equal(normalizeTrailer({ id: 'abc123', site: 'other' }), null);
  assert.equal(
    normalizeTrailer({ id: 'abc123', site: 'youtube' })?.embedUrl,
    'https://www.youtube-nocookie.com/embed/abc123',
  );
  assert.equal(
    normalizeTrailer({ id: 'abc123', site: 'dailymotion' })?.url,
    'https://www.dailymotion.com/video/abc123',
  );
});
test('media details use AniList IDs, coalesce requests, and normalize review metadata', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (_url, init) => {
    count++;
    const { variables, query } = JSON.parse(init!.body as string);
    assert.equal(variables.id, 154587);
    assert.equal(variables.idMal, undefined);
    assert.equal(variables.type, 'ANIME');
    assert.equal(variables.page, 1);
    assert.ok(query.includes('reviews('));
    return Response.json({
      data: {
        Media: {
          id: 154587,
          trailer: { site: 'youtube', id: 'abc123' },
          reviews: {
            nodes: [
              {
                id: 42,
                summary: '<b>My review</b>',
                score: 0,
                rating: 3,
                ratingAmount: 5,
                user: { name: 'Reader' },
              },
            ],
            pageInfo: { currentPage: 1, hasNextPage: true },
          },
        },
      },
    });
  };
  try {
    const [one, two] = await Promise.all([
      app.request('/api/media/-154587?format=Anime'),
      app.request('/api/media/-154587?format=Anime'),
    ]);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    const data = await one.json();
    assert.equal(data.reviews[0].score, 0);
    assert.equal(data.reviews[0].author, 'Reader');
    assert.equal(data.reviews[0].url, 'https://anilist.co/review/42');
    assert.equal(data.pageInfo.hasNextPage, true);
    await app.request('/api/media/-154587?format=Anime');
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('MAL IDs remain supported and missing trailer/reviews produce empty states', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const { variables } = JSON.parse(init!.body as string);
    assert.equal(variables.idMal, 13);
    assert.equal(variables.type, 'MANGA');
    return Response.json({ data: { Media: { id: 30013, trailer: null, reviews: null } } });
  };
  try {
    const res = await app.request('/api/media/13?format=Manga');
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.trailer, null);
    assert.deepEqual(data.reviews, []);
    assert.equal(data.pageInfo.hasNextPage, false);
  } finally {
    globalThis.fetch = original;
  }
});
test('details handle missing entries and upstream rate limits', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ errors: [{ status: 404 }] }, { status: 404 });
    assert.equal((await app.request('/api/media/999991?format=Anime')).status, 404);
    globalThis.fetch = async () =>
      new Response('', { status: 429, headers: { 'Retry-After': '5' } });
    const response = await app.request('/api/media/999992?format=Anime');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '5');
  } finally {
    globalThis.fetch = original;
  }
});
