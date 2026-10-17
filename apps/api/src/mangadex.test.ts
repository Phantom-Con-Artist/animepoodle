import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
import { mangaDexTitle, parseCoverUrl, parsePageUrl } from './mangadex.js';

type MdManga = Parameters<typeof mangaDexTitle>[0];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = '0123456789abcdef0123456789abcdef';

test('the page proxy only accepts MangaDex chapter images', () => {
  assert.ok(parsePageUrl(`https://uploads.mangadex.org/data/${hash}/1-a.jpg`));
  assert.ok(parsePageUrl(`https://abc123.xyz.mangadex.network/token-1/data-saver/${hash}/2.png`));
  for (const bad of [
    `http://uploads.mangadex.org/data/${hash}/1.jpg`,
    `https://evil.example/data/${hash}/1.jpg`,
    `https://mangadex.network.evil.example/data/${hash}/1.jpg`,
    `https://uploads.mangadex.org/covers/${hash}/1.jpg`,
    `https://uploads.mangadex.org/data/${hash}/1.jpg?x=1`,
    `https://uploads.mangadex.org/data/${hash}/../secret.jpg`,
    `https://uploads.mangadex.org/data/${hash}/page.html`,
  ])
    assert.equal(parsePageUrl(bad), null, bad);
  // Tokens differ per page server; the cache key keeps only what identifies the image.
  assert.equal(
    parsePageUrl(`https://a.mangadex.network/t1/data/${hash}/1.jpg`)?.cacheKey,
    parsePageUrl(`https://b.mangadex.network/t2/data/${hash}/1.jpg`)?.cacheKey,
  );
});

test('series match only by AniList or MAL link, never by title alone', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.match(new Headers(init?.headers).get('User-Agent') || '', /^animepoodle\//);
    const manga = (id: number, al: string | null, title: string) => ({
      id: uuid(id),
      attributes: {
        title: { en: title },
        links: al
          ? { al, engtl: 'https://publisher.example/series', raw: 'http://insecure.example' }
          : null,
        availableTranslatedLanguages: ['en', 'es-la', null],
      },
    });
    return Response.json({
      data: [manga(1, null, 'Same Name (Doujinshi)'), manga(2, '777', 'Same Name')],
    });
  };
  try {
    const found = await (
      await app.request('/api/read/series?anilist=777&title=Same%20Name')
    ).json();
    assert.equal(found.series.id, uuid(2));
    assert.deepEqual(found.series.languages, ['en', 'es-la']);
    assert.deepEqual(found.series.official, [
      { label: 'Official English release', url: 'https://publisher.example/series' },
    ]);
    const none = await (await app.request('/api/read/series?anilist=778&title=Same%20Name')).json();
    assert.equal(none.series, null);
    assert.ok(urls.every((u) => u.startsWith('https://api.mangadex.org/manga?title=')));
    assert.equal((await app.request('/api/read/series?title=x')).status, 400);
  } finally {
    globalThis.fetch = original;
  }
});

test('official chapters come back as links, scanlations as same-origin pages', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const chapter = (id: number, externalUrl: string | null) => ({
      data: {
        id: uuid(id),
        attributes: {
          chapter: '5',
          volume: null,
          title: '',
          translatedLanguage: 'en',
          pages: externalUrl ? 0 : 2,
          externalUrl,
          readableAt: '2026-10-01T00:00:00+00:00',
        },
        relationships: [
          { id: uuid(9), type: 'manga' },
          { id: uuid(8), type: 'scanlation_group', attributes: { name: 'Kind Scans' } },
        ],
      },
    });
    if (u.endsWith(`/chapter/${uuid(10)}?includes[]=scanlation_group`))
      return Response.json(chapter(10, 'https://publisher.example/ch5'));
    if (u.endsWith(`/at-home/server/${uuid(10)}`)) return new Response('{}', { status: 404 });
    if (u.endsWith(`/chapter/${uuid(11)}?includes[]=scanlation_group`))
      return Response.json(chapter(11, null));
    if (u.endsWith(`/at-home/server/${uuid(11)}`))
      return Response.json({
        baseUrl: 'https://node.mangadex.network/tok',
        chapter: { hash, data: ['a.jpg', 'b.jpg'], dataSaver: ['a.jpg', 'b.jpg'] },
      });
    throw new Error(`Unexpected ${u}`);
  };
  try {
    const external = await (await app.request(`/api/read/pages/${uuid(10)}`)).json();
    assert.equal(external.chapter.externalUrl, 'https://publisher.example/ch5');
    assert.deepEqual(external.pages, []);
    const scan = await (await app.request(`/api/read/pages/${uuid(11)}`)).json();
    assert.equal(scan.mangaId, uuid(9));
    assert.deepEqual(scan.chapter.groups, ['Kind Scans']);
    assert.equal(
      scan.pages[0],
      `/api/read/page?u=${encodeURIComponent(`https://node.mangadex.network/tok/data-saver/${hash}/a.jpg`)}`,
    );
    assert.ok(parsePageUrl(new URL(scan.pages[0], 'http://x').searchParams.get('u')!));
  } finally {
    globalThis.fetch = original;
  }
});

test('MangaDex series become catalog titles; only MangaDex-only ones join search', async () => {
  const base: MdManga = {
    id: uuid(20),
    attributes: {
      title: { 'ko-ro': 'Agnyeoneun' },
      altTitles: [{ en: 'The Villainess Is Worshipped' }, { ko: '악녀는' }],
      links: null,
      availableTranslatedLanguages: ['en'],
      description: { en: 'A story.\n\n---\n**Links:** [Official](https://x.example)' },
      originalLanguage: 'ko',
      status: 'ongoing',
      year: 2022,
      lastChapter: null,
      tags: [
        { attributes: { name: { en: 'Romance' }, group: 'genre' } },
        { attributes: { name: { en: 'Villainess' }, group: 'theme' } },
      ],
    },
    relationships: [
      { id: uuid(21), type: 'cover_art', attributes: { fileName: `${uuid(22)}.jpg` } },
    ],
  };
  const t = mangaDexTitle(base);
  assert.equal(t.format, 'Manhwa');
  assert.equal(t.title, 'The Villainess Is Worshipped');
  assert.deepEqual(t.titles, {
    english: 'The Villainess Is Worshipped',
    romaji: 'Agnyeoneun',
    native: '악녀는',
  });
  assert.equal(t.status, 'RELEASING');
  assert.deepEqual(t.genres, ['Romance']);
  assert.equal(t.description, 'A story.');
  assert.ok(t.id < -1e12 && Number.isSafeInteger(t.id));
  assert.ok(parseCoverUrl(decodeURIComponent(t.image.split('u=')[1])));
  assert.equal(parseCoverUrl('https://uploads.mangadex.org/data/x.jpg'), null);
  // A MangaDex entry that links to AniList takes the AniList-style identity.
  const linked = mangaDexTitle({
    ...base,
    attributes: { ...base.attributes, links: { al: '55', mal: '66' } },
  });
  assert.equal(linked.id, 66);
  assert.equal(linked.anilistId, 55);

  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.mangadex.org/manga?title='))
      return Response.json({
        data: [
          base,
          { ...base, id: uuid(23), attributes: { ...base.attributes, links: { al: '9' } } },
          {
            ...base,
            id: uuid(24),
            attributes: { ...base.attributes, title: { en: 'Same As AniList' }, altTitles: [] },
          },
        ],
      });
    return Response.json({
      data: {
        Page: {
          media: [
            {
              id: 9,
              idMal: null,
              title: { english: 'Same As AniList', romaji: 'Onaji', native: null },
              type: 'MANGA',
              countryOfOrigin: 'KR',
              startDate: { year: 2020 },
              averageScore: 70,
              episodes: null,
              chapters: 10,
              genres: [],
              description: '',
              coverImage: { large: 'https://s4.anilist.co/c.jpg', color: null },
            },
          ],
        },
      },
    });
  };
  try {
    const data = await (await app.request('/api/search?q=villainess-merge&format=Manhwa')).json();
    assert.equal(data.source, 'AniList + MangaDex');
    assert.deepEqual(
      data.items.map((i: { title: string }) => i.title),
      ['Same As AniList', 'The Villainess Is Worshipped'],
    );
  } finally {
    globalThis.fetch = original;
  }
});
