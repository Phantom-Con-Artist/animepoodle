import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { app } from './app';
import { sqliteHypeDatabase } from './hype-dev';
import { hypeDay, rankHype } from '@animepoodle/shared';
import type { HypeBindings } from './hype';
import { catalog } from '../../../tests/fixtures/catalog';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON;');
  sql.exec(readFileSync(new URL('../../../migrations/0001_hype.sql', import.meta.url), 'utf8'));
  const year = new Date().getUTCFullYear();
  const selected = [catalog[0], catalog.find((item) => item.format === 'Manga')!];
  for (const item of selected)
    sql
      .prepare(
        'INSERT INTO hype_titles(year,format,anilist_id,item_json,popularity) VALUES (?,?,?,?,?)',
      )
      .run(year, item.format, item.anilistId!, JSON.stringify(item), 100);
  const bindings: HypeBindings = {
    HYPE_DB: sqliteHypeDatabase(sql),
    HYPE_HASH_SECRET: 'a-secret-that-is-at-least-32-characters',
    TURNSTILE_SITE_KEY: 'site',
    TURNSTILE_SECRET_KEY: 'secret',
  };
  const ip = crypto.randomUUID();
  const voterId = crypto.randomUUID();
  let verifies = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    verifies++;
    const body = JSON.parse(String(init?.body));
    return Response.json({
      success: body.response === 'valid',
      hostname: 'animepoodle.test',
      action: 'hype',
    });
  };
  const vote = (overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    app.request(
      'https://animepoodle.test/api/hype/vote',
      {
        method: 'POST',
        headers: {
          Origin: 'https://animepoodle.test',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ip,
          ...headers,
        },
        body: JSON.stringify({
          voterId,
          requestId: crypto.randomUUID(),
          format: 'Anime',
          anilistId: selected[0].anilistId,
          turnstileToken: 'valid',
          ...overrides,
        }),
      },
      bindings,
    );
  return {
    sql,
    year,
    selected,
    bindings,
    vote,
    voterId,
    get verifies() {
      return verifies;
    },
  };
}

test('one global daily wallet permits exactly ten points across separate sections', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) {
    const item = f.selected[i % 2];
    const response = await f.vote({ format: item.format, anilistId: item.anilistId });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).remaining, 9 - i);
  }
  const exhausted = await f.vote();
  assert.equal(exhausted.status, 409);
  assert.equal((await exhausted.json()).remaining, 0);
  assert.equal(f.sql.prepare('SELECT SUM(points) AS points FROM hype_titles').get()!.points, 10);
  assert.deepEqual(
    f.sql
      .prepare('SELECT points FROM hype_titles ORDER BY format')
      .all()
      .map((row) => row.points),
    [5, 5],
  );
  assert.equal(f.verifies, 10);
  f.sql.close();
});

test('retrying the same request is idempotent and cannot change its target', async () => {
  const f = fixture();
  const requestId = crypto.randomUUID();
  const first = await f.vote({ requestId });
  const second = await f.vote({ requestId, turnstileToken: '' });
  assert.equal(first.status, 200);
  assert.deepEqual(await second.json(), await first.json());
  const changed = await f.vote({
    requestId,
    format: f.selected[1].format,
    anilistId: f.selected[1].anilistId,
  });
  assert.equal(changed.status, 409);
  assert.equal(f.verifies, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_votes').get()!.count, 1);
  f.sql.close();
});

test('simultaneous tabs cannot exceed the tenth point', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 12 }, () => f.vote()));
  assert.equal(responses.filter((r) => r.status === 200).length, 10);
  assert.equal(responses.filter((r) => r.status === 409).length, 2);
  assert.equal(f.sql.prepare('SELECT spent FROM hype_wallets').get()!.spent, 10);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_votes').get()!.count, 10);
  f.sql.close();
});

test('daily reset grants new points while yearly totals persist', async () => {
  const f = fixture();
  const secret = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(f.bindings.HYPE_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(`voter:${f.voterId}`)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  f.sql
    .prepare('INSERT INTO hype_wallets(day,voter,spent) VALUES (?,?,10)')
    .run('2000-01-01', hash);
  f.sql.prepare('UPDATE hype_titles SET points=50 WHERE format=?').run('Anime');
  const response = await f.vote();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.day, hypeDay());
  assert.equal(data.remaining, 9);
  assert.equal(data.points, 51);
  const privateWallet = await app.request(
    'https://animepoodle.test/api/hype/wallet',
    { headers: { 'X-Hype-Voter': f.voterId } },
    f.bindings,
  );
  assert.equal(privateWallet.headers.get('Cache-Control'), 'no-store');
  assert.equal((await privateWallet.json()).remaining, 9);
  f.sql.close();
});

test('malformed, cross-origin, oversized and failed bot checks cannot write votes', async () => {
  const f = fixture();
  assert.equal((await f.vote({}, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.vote({ voterId: 'fake' })).status, 400);
  assert.equal((await f.vote({ format: 'All' })).status, 400);
  assert.equal((await f.vote({ anilistId: -1 })).status, 400);
  assert.equal((await f.vote({ huge: 'x'.repeat(5000) })).status, 400);
  assert.equal((await f.vote({ turnstileToken: 'invalid' })).status, 403);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_votes').get()!.count, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_wallets').get()!.count, 0);
  f.sql.close();
});

test('the daily write circuit breaker leaves the wallet unchanged', async () => {
  const f = fixture();
  f.bindings.HYPE_DAILY_VOTE_CAP = '1';
  assert.equal((await f.vote()).status, 200);
  const blocked = await f.vote({ voterId: crypto.randomUUID() });
  assert.equal(blocked.status, 429);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_wallets').get()!.count, 1);
  assert.equal(f.sql.prepare('SELECT SUM(points) AS points FROM hype_titles').get()!.points, 1);
  f.sql.close();
});

test('cheap throttling rejects repeated bad verification before unbounded provider work', async () => {
  const f = fixture();
  const responses = [];
  for (let i = 0; i < 25; i++) responses.push(await f.vote({ turnstileToken: 'invalid' }));
  assert.equal(responses.filter((response) => response.status === 429).length, 10);
  assert.equal(f.verifies, 15);
  f.sql.close();
});

test('real Hype outranks popularity; popularity breaks ties without fake seed votes', () => {
  const low = { ...catalog[0], popularity: 1 };
  const high = { ...catalog[1], popularity: 1000000 };
  assert.deepEqual(
    rankHype([
      { item: high, points: 0 },
      { item: low, points: 1 },
      { item: low, points: 0 },
    ]).map((entry) => entry.item.id),
    [low.id, high.id],
  );
  assert.equal(
    rankHype([
      { item: low, points: 0 },
      { item: high, points: 0 },
    ])[0].item.id,
    high.id,
  );
});

test('unconfigured production voting fails closed', async () => {
  assert.equal(
    (await app.request('https://animepoodle.test/api/hype/vote', { method: 'POST' }, {})).status,
    503,
  );
});

test('leaderboards aggregate real points, keep sections apart and cache only public data', async () => {
  const f = fixture();
  assert.equal((await f.vote()).status, 200);
  globalThis.fetch = async (_input, init) => {
    const { variables } = JSON.parse(String(init?.body));
    return Response.json({
      data: {
        Page: {
          pageInfo: { currentPage: 1, hasNextPage: false },
          media: [
            {
              id: variables.type === 'ANIME' ? 91234 : 91235,
              title: { english: 'Popular seed', romaji: 'Popular seed', native: null },
              type: variables.type,
              countryOfOrigin: variables.country,
              startDate: { year: f.year },
              popularity: 1000000,
              averageScore: 80,
              episodes: 12,
              chapters: null,
              genres: [],
              description: 'Seed',
              coverImage: { large: 'https://example.com/cover.jpg', color: null },
            },
          ],
        },
      },
    });
  };
  const response = await app.request(
    'https://animepoodle.test/api/hype?format=Anime',
    undefined,
    f.bindings,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control')!, /public.*s-maxage=60/);
  const data = await response.json();
  assert.equal(data.mode, 'hype');
  assert.equal(data.entries[0].item.anilistId, f.selected[0].anilistId);
  assert.equal(data.entries[0].points, 1);
  assert.equal(data.entries[1].points, 0);
  const manga = await app.request(
    'https://animepoodle.test/api/hype?format=Manga',
    undefined,
    f.bindings,
  );
  const separate = await manga.json();
  assert.equal(separate.mode, 'popular');
  assert.ok(
    separate.entries.every(
      (entry: { points: number; item: { format: string } }) =>
        entry.points === 0 && entry.item.format === 'Manga',
    ),
  );
  assert.equal(separate.entries[0].item.year, f.year);
  f.sql.close();
});

test('simultaneous voters cannot cross the persistent site-wide write cap', async () => {
  const f = fixture();
  f.bindings.HYPE_DAILY_VOTE_CAP = '1';
  const responses = await Promise.all([f.vote(), f.vote({ voterId: crypto.randomUUID() })]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 429]);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_votes').get()!.count, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM hype_wallets').get()!.count, 1);
  f.sql.close();
});

test('new titles resolve MAL identities with a coalesced metadata-only lookup', async () => {
  const f = fixture();
  let lookups = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('siteverify'))
      return Response.json({ success: true, hostname: 'animepoodle.test', action: 'hype' });
    lookups++;
    const { query, variables } = JSON.parse(String(init?.body));
    assert.ok(query.includes('query HypeTitle'));
    assert.ok(!query.includes('reviews'));
    assert.equal(variables.idMal, 7777);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({
      data: {
        Media: {
          id: 8888,
          idMal: 7777,
          title: { english: 'Verified title', romaji: 'Verified title', native: null },
          type: 'ANIME',
          countryOfOrigin: 'JP',
          startDate: { year: f.year },
          popularity: 123,
          genres: [],
          description: 'Metadata only',
          coverImage: { large: 'https://example.com/verified.jpg', color: null },
        },
      },
    });
  };
  const responses = await Promise.all([
    f.vote({ anilistId: undefined, malId: 7777 }),
    f.vote({ anilistId: undefined, malId: 7777, voterId: crypto.randomUUID() }),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).anilistId, 8888);
  }
  assert.equal(lookups, 1);
  assert.equal((await f.vote({ anilistId: undefined, malId: 7777 })).status, 200);
  assert.equal(lookups, 1);
  assert.equal(
    f.sql.prepare('SELECT points FROM hype_titles WHERE anilist_id=8888').get()!.points,
    3,
  );
  f.sql.close();
});
