import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
test('catalog supports combined search and format filters', async () => {
  const response = await app.request('/api/catalog?q=solo&format=Manhwa');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].format, 'Manhwa');
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
