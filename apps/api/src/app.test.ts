import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
test('legacy catalog redirects to on-demand search', async () => {
  const response = await app.request('/api/catalog?q=solo&format=Manhwa');
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/api/search?q=solo&format=Manhwa');
});
test('discovery validates release statuses and sorting', async () => {
  for (const path of [
    '/api/discover?status=nope',
    '/api/discover?format=nope',
    '/api/discover?sort=nope',
    '/api/search?q=valid&status=nope',
  ])
    assert.equal((await app.request(path)).status, 400);
});
test('live search rejects invalid requests before upstream access', async () => {
  assert.equal((await app.request('/api/search?q=x')).status, 400);
  assert.equal((await app.request('/api/search?q=naruto&format=invalid')).status, 400);
});
test('health and unknown routes expose predictable JSON', async () => {
  assert.equal((await app.request('/api/health')).status, 200);
  assert.equal((await app.request('/api/missing')).status, 404);
});
test('AniList search forwards filters, normalizes results, and caches requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.variables.type, 'MANGA');
    assert.equal(body.variables.country, 'KR');
    return Response.json({
      data: {
        Page: {
          media: [
            {
              id: 123,
              idMal: null,
              title: { english: 'Test Story', romaji: 'Test', native: '테스트' },
              type: 'MANGA',
              countryOfOrigin: 'KR',
              startDate: { year: 2024 },
              averageScore: 85,
              episodes: null,
              chapters: 100,
              status: 'FINISHED',
              genres: ['Action', 'Fantasy'],
              description: 'A <b>great</b> story.',
              coverImage: { large: 'https://example.com/cover.jpg', color: null },
            },
          ],
        },
      },
    });
  };
  try {
    const first = await app.request('/api/search?q=unit-test-story&format=Manhwa');
    assert.equal(first.status, 200);
    const data = await first.json();
    assert.equal(data.source, 'AniList');
    assert.equal(data.items[0].format, 'Manhwa');
    assert.equal(data.items[0].rating, 8.5);
    assert.equal(data.items[0].description, 'A great story.');
    await app.request('/api/search?q=unit-test-story&format=Manhwa');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('live discovery forwards release filters and coalesces identical requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const { query, variables } = JSON.parse(init!.body as string);
    assert.ok(query.includes('status:$status'));
    assert.ok(query.includes('tags{name rank'));
    assert.equal(variables.type, 'ANIME');
    assert.equal(variables.country, 'CN');
    assert.equal(variables.status, 'NOT_YET_RELEASED');
    assert.deepEqual(variables.sort, ['START_DATE_DESC', 'POPULARITY_DESC']);
    return Response.json({
      data: {
        Page: {
          media: [
            {
              id: 99991,
              idMal: null,
              title: { english: 'Future live story', romaji: 'Future', native: null },
              type: 'ANIME',
              countryOfOrigin: 'CN',
              format: 'ONA',
              status: 'NOT_YET_RELEASED',
              tags: [{ name: 'Time Travel', rank: 95 }],
              startDate: { year: null },
              averageScore: null,
              episodes: null,
              chapters: null,
              genres: ['Fantasy'],
              description: null,
              coverImage: { large: 'https://example.com/live.jpg', color: null },
            },
          ],
        },
      },
    });
  };
  try {
    const path = '/api/discover?format=Donghua&status=NOT_YET_RELEASED&sort=START_DATE_DESC';
    const responses = await Promise.all([app.request(path), app.request(path)]);
    const data = await responses[0].json();
    assert.equal(data.items[0].title, 'Future live story');
    assert.equal(data.items[0].status, 'NOT_YET_RELEASED');
    assert.equal(data.items[0].year, 0);
    assert.equal(data.items[0].tags[0].rank, 95);
    assert.ok(Date.parse(data.fetchedAt));
    await app.request(path);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
