import { catalog } from '../../../tests/fixtures/catalog';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app';
import { mergeCatalog } from './catalog-service';
import { mediaIdentity, type Title } from '@animepoodle/shared';
import { normalizeYoutubeLinks } from './anilist';
const aniMedia = (id: number, malId: number, title: string) => ({
  id,
  idMal: malId,
  title: { english: title, romaji: title, native: title },
  type: 'ANIME',
  countryOfOrigin: 'JP',
  startDate: { year: 2024 },
  averageScore: 90,
  episodes: 12,
  genres: ['Fantasy'],
  description: 'Primary description',
  tags: [
    { name: 'Time Travel', rank: 95 },
    { name: 'Spoiler tag', rank: 90, isMediaSpoiler: true },
    { name: 'Adult tag', rank: 90, isAdult: true },
  ],
  bannerImage: 'https://s4.anilist.co/banner.jpg',
  coverImage: { large: 'https://s4.anilist.co/cover.jpg', color: null },
});
const jikanMedia = (id: number, title: string) => ({
  mal_id: id,
  title,
  type: 'TV',
  year: 2024,
  score: 8,
  episodes: 12,
  genres: [{ name: 'Fantasy' }],
  images: { jpg: { large_image_url: 'https://cdn.myanimelist.net/cover.jpg' } },
});
test('normal searches stay on AniList and preserve API artwork', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(String(url), 'https://graphql.anilist.co');
    return Response.json({ data: { Page: { media: [aniMedia(11, 111, 'Primary only')] } } });
  };
  try {
    const res = await app.request('/api/search?q=providers-primary&format=Anime');
    const data = await res.json();
    assert.equal(data.source, 'AniList');
    assert.equal(data.items[0].bannerImage, 'https://s4.anilist.co/banner.jpg');
    assert.equal(data.items[0].malId, 111);
    assert.deepEqual(data.items[0].tags, [{ name: 'Time Travel', rank: 95 }]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('Jikan takes over when AniList fails and broadening keeps primary duplicates', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://graphql.anilist.co') {
      const { variables } = JSON.parse(init!.body as string);
      return variables.search === 'providers-fallback'
        ? new Response('', { status: 503 })
        : Response.json({ data: { Page: { media: [aniMedia(12, 222, 'Primary wins')] } } });
    }
    assert.ok(String(url).startsWith('https://api.jikan.moe/v4/anime?'));
    assert.ok(String(url).includes('sfw=true'));
    return Response.json({
      data: [jikanMedia(222, 'Secondary duplicate'), jikanMedia(223, 'Extra story')],
    });
  };
  try {
    const fallback = await app.request('/api/search?q=providers-fallback&format=Anime');
    const first = await fallback.json();
    assert.equal(fallback.status, 200);
    assert.equal(first.source, 'Jikan');
    assert.equal(first.items[0].source, 'Jikan');
    const broad = await app.request('/api/search?q=providers-broad&format=Anime&broaden=1');
    const data = await broad.json();
    assert.equal(data.source, 'AniList + Jikan');
    assert.equal(data.items.length, 2);
    assert.equal(data.items[0].title, 'Primary wins');
  } finally {
    globalThis.fetch = original;
  }
});
test('cross-source merging preserves anime versus manga while deduplicating MAL identities', () => {
  const primary = { ...catalog[0], id: 5, malId: 5, source: 'AniList' } as Title;
  assert.equal(
    mergeCatalog(
      [primary],
      [
        { ...primary, title: 'Duplicate', source: 'Jikan' },
        { ...primary, format: 'Manga' },
      ],
    ).length,
    2,
  );
});
test('YouTube links accept known HTTPS hosts and reject lookalikes or disabled links', () => {
  const links = normalizeYoutubeLinks({ site: 'youtube', id: 'abc123' }, [
    { site: 'YouTube', url: 'https://youtube.com/watch?v=other' },
    { site: 'YouTube', url: 'https://youtube.com.evil.test/watch?v=other' },
    { site: 'YouTube', url: 'javascript:alert(1)' },
    { site: 'YouTube', url: 'https://youtu.be/hidden', isDisabled: true },
  ]);
  assert.equal(links.length, 2);
  assert.equal(links[0].label, 'Trailer on YouTube');
  assert.equal(links[1].source, 'AniList');
});
test('supplemental media combines songs, thumbnails, and video links without flagged theme entries', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const value = String(url);
    calls.push(value);
    if (value.startsWith('https://api.animethemes.moe/')) {
      const query = new URL(value).searchParams;
      assert.equal(query.get('filter[site]'), 'AniList');
      assert.equal(query.get('filter[external_id]'), '999991');
      assert.ok((init?.headers as Record<string, string>)['User-Agent'].includes('animepoodle'));
      return Response.json({
        anime: [
          {
            slug: 'test_anime',
            images: [{ facet: 'Large Cover', link: 'https://cdn.example.com/art.jpg' }],
            animethemes: [
              {
                id: 1,
                slug: 'OP1',
                song: { title: 'Opening Song', artists: [{ name: 'Artist' }] },
                animethemeentries: [
                  {
                    id: 11,
                    spoiler: false,
                    nsfw: false,
                    episodes: '1-12',
                    videos: [
                      {
                        link: 'https://v.animethemes.moe/OP1.webm',
                        size: 100,
                        audio: { link: 'https://a.animethemes.moe/OP1.ogg' },
                      },
                    ],
                  },
                  {
                    id: 12,
                    spoiler: true,
                    nsfw: false,
                    videos: [{ link: 'https://v.animethemes.moe/spoiler.webm', size: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      });
    }
    if (value.endsWith('/pictures'))
      return Response.json({
        data: [{ jpg: { large_image_url: 'https://cdn.myanimelist.net/picture.jpg' } }],
      });
    if (value.endsWith('/videos'))
      return Response.json({
        data: {
          promo: [{ title: 'PV', trailer: { youtube_id: 'pv123' } }],
          music_videos: [{ title: 'Official music video', video: { youtube_id: 'mv123' } }],
        },
      });
    if (value.endsWith('/full'))
      return Response.json({ data: { theme: { openings: ['Fallback OP'], endings: [] } } });
    throw new Error('Unexpected request');
  };
  try {
    const res = await app.request('/api/extras?anilistId=999991&malId=999991&format=Anime');
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.themes.length, 1);
    assert.equal(data.themes[0].audioUrl, 'https://a.animethemes.moe/OP1.ogg');
    assert.equal(data.themes[0].artists[0], 'Artist');
    assert.equal(data.videos.length, 2);
    assert.equal(data.artwork.length, 2);
    assert.ok(data.sources.every((s: { status: string }) => s.status === 'ok'));
    const count = calls.length;
    await app.request('/api/extras?anilistId=999991&malId=999991&format=Anime');
    assert.equal(calls.length, count);
  } finally {
    globalThis.fetch = original;
  }
});
test('supplemental provider failures stay isolated, with graceful validation and manga behavior', async () => {
  assert.equal((await app.request('/api/extras?format=Anime')).status, 400);
  assert.equal((await app.request('/api/extras?anilistId=abc&format=Anime')).status, 400);
  assert.equal((await app.request('/api/extras?malId=123&format=All')).status, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('animethemes.moe')
      ? new Response('unavailable', { status: 503 })
      : Response.json({ data: [] });
  try {
    const partial = await (await app.request('/api/extras?anilistId=999992&format=Anime')).json();
    assert.equal(partial.sources[0].status, 'unavailable');
    assert.deepEqual(partial.themes, []);
    const manga = await (await app.request('/api/extras?malId=999993&format=Manga')).json();
    assert.equal(manga.sources[0].status, 'not-applicable');
    assert.equal(manga.sources[1].status, 'ok');
  } finally {
    globalThis.fetch = original;
  }
});

test('Jikan identities never inherit a different curated title’s AniList ID', () => {
  const collision = {
    ...catalog[0],
    id: catalog[6].id,
    malId: catalog[6].id,
    anilistId: undefined,
    source: 'Jikan' as const,
    title: 'Another public catalog title',
  };
  assert.equal(mediaIdentity(collision).anilistId, undefined);
  assert.equal(mediaIdentity(collision).malId, collision.malId);
});
