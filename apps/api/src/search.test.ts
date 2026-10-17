import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app';

const media = (id: number, title: string, genres = ['Fantasy']) => ({
  id,
  idMal: id + 1000,
  title: { english: title, romaji: title, native: null },
  type: 'ANIME',
  countryOfOrigin: 'JP',
  startDate: { year: 2024 },
  averageScore: 80,
  episodes: 12,
  genres,
  description: '',
  coverImage: { large: 'https://s4.anilist.co/cover.jpg', color: null },
});

test('search adds studio works and genre/tag matches after title hits', async () => {
  const original = globalThis.fetch;
  const bodies: { query: string; variables: Record<string, unknown> }[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (body.query.startsWith('query Keywords'))
      return Response.json({ data: { Page: { media: [media(3, 'Popular isekai romance')] } } });
    return Response.json({
      data: {
        Page: { media: [media(9, 'Loosely related'), media(1, 'Isekai Romcom Diaries')] },
        studios: {
          studios: [
            { name: 'Isekai Romcom Works', media: { nodes: [media(2, 'Studio hit')] } },
            { name: 'Unrelated Studio', media: { nodes: [media(4, 'Not wanted')] } },
          ],
        },
        GenreCollection: ['Romance', 'Comedy', 'Hentai'],
        MediaTagCollection: [{ name: 'Isekai' }, { name: 'Adult only', isAdult: true }],
      },
    });
  };
  try {
    const res = await app.request('/api/search?q=isekai%20romcom&format=Anime');
    const data = await res.json();
    assert.deepEqual(
      data.items.map((t: { title: string }) => t.title),
      ['Isekai Romcom Diaries', 'Studio hit', 'Popular isekai romance', 'Loosely related'],
    );
    assert.deepEqual(data.matched, {
      genres: ['Romance', 'Comedy'],
      tags: ['Isekai'],
      studios: ['Isekai Romcom Works'],
    });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].variables.vocab, true);
    assert.deepEqual(bodies[1].variables.tags, ['Isekai']);

    // The cached vocabulary lets the next keyword search run in parallel without reloading it.
    bodies.length = 0;
    await app.request('/api/search?q=romance&format=Anime');
    assert.equal(bodies.length, 2);
    assert.equal(bodies.find((b) => b.query.startsWith('query Search'))?.variables.vocab, false);
  } finally {
    globalThis.fetch = original;
  }
});
