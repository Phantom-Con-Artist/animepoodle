import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('community route maps Jikan reviews, forum threads and background', async () => {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (url) => {
    const path = String(url);
    seen.push(path);
    if (path.endsWith('/anime/7001/full'))
      return json({
        data: { mal_id: 7001, title: 'X', background: ' Won an award. ', members: 1200, rank: 4 },
      });
    if (path.includes('/anime/7001/reviews'))
      return json({
        data: [
          {
            mal_id: 1,
            url: 'https://myanimelist.net/reviews.php?id=1',
            date: '2024-01-02T00:00:00+00:00',
            review: 'Great   show. '.repeat(100),
            score: 9,
            tags: ['Recommended'],
            is_spoiler: true,
            reactions: { overall: 12 },
            user: {
              username: 'reader',
              images: { jpg: { image_url: 'http://bad.example/a.jpg' } },
            },
          },
          { mal_id: 2, review: null },
        ],
        pagination: { has_next_page: true },
      });
    if (path.includes('/anime/7001/forum'))
      return json({
        data: [
          {
            mal_id: 9,
            title: 'Episode 1 discussion',
            author_username: 'mod',
            comments: 40,
            url: 'https://myanimelist.net/forum/?topicid=9',
          },
        ],
      });
    throw new Error(`unexpected ${path}`);
  };
  try {
    const res = await app.request('/api/community?format=Anime&malId=7001');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.background, 'Won an award.');
    assert.equal(body.rank, 4);
    assert.equal(body.reviews.length, 1, 'reviews without text are dropped');
    const [review] = body.reviews;
    assert.equal(review.author, 'reader');
    assert.equal(review.verdict, 'Recommended');
    assert.equal(review.spoiler, true);
    assert.equal(review.avatar, null, 'non-HTTPS avatars are rejected');
    assert.ok(review.excerpt.length <= 701 && review.excerpt.endsWith('…'));
    assert.ok(!review.excerpt.includes('  '), 'whitespace is collapsed');
    assert.equal(body.hasNextPage, true);
    assert.deepEqual(body.topics[0], {
      id: 9,
      title: 'Episode 1 discussion',
      author: 'mod',
      comments: 40,
      date: null,
      url: 'https://myanimelist.net/forum/?topicid=9',
    });
    assert.equal(body.notice, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test('community route validates input', async () => {
  assert.equal((await app.request('/api/community?format=Anime&malId=abc')).status, 400);
  assert.equal((await app.request('/api/community?format=All&malId=5')).status, 400);
  assert.equal((await app.request('/api/community?format=Manga&malId=5&page=0')).status, 400);
});
