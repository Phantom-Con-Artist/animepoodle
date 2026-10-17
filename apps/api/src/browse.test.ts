import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app.js';
import { parseAnimeOfTheYear } from './browse.js';
import { currentSeason, displayTitle, uniqueTitles, type Title } from '@animepoodle/shared';
import { catalog } from '../../../tests/fixtures/catalog';

// Shapes copied from the live Wikipedia table, including the awkward ones.
const wikitext = [
  '{| class="wikitable"',
  '! rowspan="9" style="text-align:center;"| [[2016 in anime|2016]]<br/><small>([[1st Crunchyroll Anime Awards|1st]])</small>',
  '|- style="background:#FAEB86"',
  "| '''''[[Yuri on Ice]]'''''",
  "| '''[[MAPPA]]'''",
  '|-',
  "| ''[[Joker Game]]''",
  '| [[Production I.G]]',
  '! rowspan="7" style="text-align:center;"| [[2022 in anime|2022]]/[[2023 in anime|2023]]<br/><small>([[8th Crunchyroll Anime Awards|8th]])</small>',
  '|- style="background:#FAEB86"',
  "| '''''Jujutsu Kaisen'' ([[Jujutsu Kaisen season 2|season 2]])'''",
  "| '''MAPPA'''",
  '! rowspan="7" style="text-align:center;"| [[2025 in anime|2025]]<br/><small>([[10th Crunchyroll Anime Awards|10th]])</small>',
  '|- style="background:#FAEB86;"',
  "| '''''[[My Hero Academia (TV series)|My Hero Academia: Final Season]]'' ([[My Hero Academia season 8|season 8]])'''",
  "| '''[[Bones (studio)|Bones Film]]'''",
  '|}',
].join('\n');

test('award parser reads winners, multi-year ceremonies and season notes', () => {
  const winners = parseAnimeOfTheYear(wikitext);
  assert.deepEqual(
    winners.map((w) => [w.year, w.from, w.ceremony, w.title, w.hint, w.studio]),
    [
      [2016, 2016, '1st Crunchyroll Anime Awards', 'Yuri on Ice', '', 'MAPPA'],
      [2023, 2022, '8th Crunchyroll Anime Awards', 'Jujutsu Kaisen', 'season 2', 'MAPPA'],
      [
        2025,
        2025,
        '10th Crunchyroll Anime Awards',
        'My Hero Academia: Final Season',
        'season 8',
        'Bones Film',
      ],
    ],
  );
});

test('browse validates filters before calling AniList', async () => {
  for (const q of [
    'format=All',
    'format=Anime&kind=MANGA',
    'format=Manga&kind=TV',
    'format=Anime&year=20x6',
    'format=Anime&season=AUTUMN',
    'format=Anime&sort=RANDOM',
    'format=Anime&genre=%3Cscript%3E',
    'format=Anime&page=0',
  ])
    assert.equal((await app.request(`/api/browse?${q}`)).status, 400, q);
  assert.equal((await app.request('/api/highlights?format=All')).status, 400);
  assert.equal((await app.request('/api/studio/abc')).status, 400);
  assert.equal((await app.request('/api/studio/11?sort=RANDOM')).status, 400);
});

test('browse maps seasons, years and types onto AniList variables', async () => {
  const original = globalThis.fetch;
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)).variables);
    return new Response(
      JSON.stringify({
        data: { Page: { pageInfo: { currentPage: 1, hasNextPage: false, total: 0 }, media: [] } },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    assert.equal(
      (await app.request('/api/browse?format=Anime&kind=MOVIE,OVA&season=FALL&year=2026')).status,
      200,
    );
    assert.equal(
      (await app.request('/api/browse?format=Manhwa&year=2024&sort=SCORE_DESC')).status,
      200,
    );
    assert.deepEqual(
      [sent[0].formats, sent[0].season, sent[0].seasonYear, sent[0].from, sent[0].country],
      [['MOVIE', 'OVA'], 'FALL', 2026, undefined, 'JP'],
    );
    // Comics have no seasons: the year becomes a start-date range, and top lists need votes.
    assert.deepEqual(
      [sent[1].type, sent[1].country, sent[1].from, sent[1].to, sent[1].pop],
      ['MANGA', 'KR', 20240000, 20250000, 400],
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('shared helpers: seasons, title language and de-duplication', () => {
  assert.deepEqual(currentSeason(new Date('2026-10-17T00:00:00Z')), { season: 'FALL', year: 2026 });
  assert.deepEqual(currentSeason(new Date('2026-12-05T00:00:00Z')), {
    season: 'WINTER',
    year: 2027,
  });
  assert.deepEqual(currentSeason(new Date('2026-04-01T00:00:00Z')), {
    season: 'SPRING',
    year: 2026,
  });
  const item: Title = {
    ...catalog[0],
    titles: {
      english: 'Frieren: Beyond Journey’s End',
      romaji: 'Sousou no Frieren',
      native: '葬送のフリーレン',
    },
  };
  assert.equal(displayTitle(item, 'romaji'), 'Sousou no Frieren');
  assert.equal(displayTitle(item, 'native'), '葬送のフリーレン');
  assert.equal(
    displayTitle({ ...item, titles: { english: null, romaji: 'X', native: null } }, 'english'),
    'X',
  );
  assert.equal(uniqueTitles([catalog[0], catalog[1], catalog[0]]).length, 2);
});
